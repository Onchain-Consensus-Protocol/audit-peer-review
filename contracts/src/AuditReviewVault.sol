// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./IAuditReviewVault.sol";

/**
 * @title AuditReviewVault
 * @notice OCP 通用 Vault 机制的审计同行评审专用版本。
 * @dev 本合约位于独立子项目，不继承也不修改 OCP Core。结果与结算算法基于
 *      OCPVault v4，但资金入口和 ABI 不兼容通用 v4：donate 已删除，首次质押必须
 *      绑定公开 Review，后续只能向原方向追加。
 *      合约只能验证 Review 的存在、字节长度和哈希，不能判断其技术质量。
 */
contract AuditReviewVault is ReentrancyGuard, IAuditReviewVault {
    using SafeERC20 for IERC20;

    uint256 public constant override MIN_REVIEW_BYTES = 200;
    uint256 public constant override MAX_REVIEW_BYTES = 4096;

    IERC20 public immutable override stakeToken;
    uint256 public immutable override resolutionTime;
    uint256 public immutable override minStake;
    address public immutable factory;

    struct StakeInfo {
        uint256 yes;
        uint256 no;
        uint256 invalid;
    }

    mapping(address => StakeInfo) private _stakeOf;
    mapping(address => bool) public override claimed;
    mapping(address => bool) public override hasReview;
    mapping(address => bytes32) public override reviewHashOf;
    mapping(address => Side) private _reviewSideOf;

    uint256[3] private _totalStakeBySide;
    uint256[3] private _participantCountBySide;
    uint256 private _totalPrincipal;
    uint256 private _totalParticipants;

    bool public override resolved;
    Outcome public override outcome;
    uint256 public override remainingEligibleClaims;
    uint256 public override settlementPool;
    uint256 public override totalPaid;

    event Staked(address indexed user, Side indexed side, uint256 amount, uint256 totalAmount);
    event Finalized(
        Outcome outcome, uint256 totalYes, uint256 totalNo, uint256 totalInvalid, uint256 settlementPool
    );
    event Withdrawn(address indexed user, uint256 payout);

    constructor(address factory_, address stakeToken_, uint256 resolutionTime_, uint256 minStake_) {
        require(factory_ != address(0), "Invalid factory");
        require(stakeToken_ != address(0), "Invalid token");
        require(resolutionTime_ > block.timestamp, "Invalid resolutionTime");
        require(minStake_ > 0, "Invalid min stake");
        factory = factory_;
        stakeToken = IERC20(stakeToken_);
        resolutionTime = resolutionTime_;
        minStake = minStake_;
        outcome = Outcome.PENDING;
    }

    function auditReviewVersion() external pure override returns (uint256) {
        return 2;
    }

    function totalPrincipal() external view override returns (uint256) {
        return _totalPrincipal;
    }

    function totalStakeYes() external view override returns (uint256) {
        return _totalStakeBySide[0];
    }

    function totalStakeNo() external view override returns (uint256) {
        return _totalStakeBySide[1];
    }

    function totalStakeInvalid() external view override returns (uint256) {
        return _totalStakeBySide[2];
    }

    function stakeOf(address user) external view override returns (uint256, uint256, uint256) {
        StakeInfo storage info = _stakeOf[user];
        return (info.yes, info.no, info.invalid);
    }

    function sideOf(address user) public view override returns (Side side, bool hasPosition) {
        StakeInfo storage info = _stakeOf[user];
        if (info.yes > 0) return (Side.YES, true);
        if (info.no > 0) return (Side.NO, true);
        if (info.invalid > 0) return (Side.INVALID, true);
        return (Side.YES, false);
    }

    function reviewSideOf(address reviewer) external view override returns (Side side) {
        require(hasReview[reviewer], "Review not submitted");
        return _reviewSideOf[reviewer];
    }

    function canResolve() public view override returns (bool) {
        return resolved || (block.timestamp >= resolutionTime && _totalPrincipal > 0);
    }

    /**
     * @notice 通用 IOCPVault 入口在本专用 Vault 中永久禁用。
     * @dev 首次必须走 stakeWithReview，后续必须走 addStake，避免绕过 Review 门槛。
     */
    function stake(Side, uint256) external pure override {
        revert("Use stakeWithReview or addStake");
    }

    function stakeWithReview(Side side, uint256 amount, string calldata review) external override nonReentrant {
        bytes32 reviewHash = _recordReview(msg.sender, side, review);
        _transferAndRecordStake(msg.sender, side, amount);
        emit ReviewSubmitted(msg.sender, side, reviewHash, review);
    }

    function bootstrapCreatorNo(address creator, uint256 amount, string calldata review)
        external
        override
        nonReentrant
    {
        require(msg.sender == factory, "Only factory");
        require(creator != address(0), "Invalid creator");
        require(_totalPrincipal == 0, "Already bootstrapped");
        require(amount >= minStake, "Amount below min stake");
        require(stakeToken.balanceOf(address(this)) >= amount, "Bootstrap funds missing");

        bytes32 reviewHash = _recordReview(creator, Side.NO, review);
        _recordStake(creator, Side.NO, amount);
        emit ReviewSubmitted(creator, Side.NO, reviewHash, review);
    }

    /**
     * @notice 后续追加不需要再次提交 Review，也不接收方向参数。
     */
    function addStake(uint256 amount) external override nonReentrant {
        require(hasReview[msg.sender], "Review required for first stake");
        _transferAndRecordStake(msg.sender, _reviewSideOf[msg.sender], amount);
    }

    function finalize() external override nonReentrant {
        require(!resolved, "Already finalized");
        require(block.timestamp >= resolutionTime, "Staking not ended");
        require(_totalPrincipal > 0, "Empty vault");
        outcome = _deriveOutcome();
        resolved = true;
        settlementPool = stakeToken.balanceOf(address(this));
        remainingEligibleClaims =
            outcome == Outcome.INVALID ? _totalParticipants : _participantCountBySide[outcome == Outcome.YES ? 0 : 1];
        emit Finalized(outcome, _totalStakeBySide[0], _totalStakeBySide[1], _totalStakeBySide[2], settlementPool);
    }

    function withdraw() external override nonReentrant {
        require(resolved, "Not finalized");
        require(!claimed[msg.sender], "Already claimed");
        StakeInfo storage info = _stakeOf[msg.sender];
        uint256 principal = _userPrincipal(info);
        require(principal > 0, "No stake");

        (Side userSide,) = sideOf(msg.sender);
        bool eligible = outcome == Outcome.INVALID || (outcome == Outcome.YES && userSide == Side.YES)
            || (outcome == Outcome.NO && userSide == Side.NO);
        claimed[msg.sender] = true;

        uint256 payout;
        if (eligible) {
            require(remainingEligibleClaims > 0, "No eligible claims");
            if (remainingEligibleClaims == 1) {
                /*
                 * 主网安全边界：终局后的结算只认 finalize 时冻结的 settlementPool。
                 * 不能读取实时余额，否则第三方在终局后直接转入的 USDC 会被最后领取者
                 * 带走，使实际 payout 总和超过链上声明的结算快照。
                 */
                payout = settlementPool - totalPaid;
            } else {
                uint256 denominator =
                    outcome == Outcome.INVALID ? _totalPrincipal : _totalStakeBySide[outcome == Outcome.YES ? 0 : 1];
                payout = Math.mulDiv(settlementPool, principal, denominator);
            }
            totalPaid += payout;
            remainingEligibleClaims -= 1;
        }
        if (payout > 0) stakeToken.safeTransfer(msg.sender, payout);
        emit Withdrawn(msg.sender, payout);
    }

    function _transferAndRecordStake(address user, Side side, uint256 amount) private {
        require(!resolved, "Already finalized");
        require(block.timestamp < resolutionTime, "Staking ended");
        require(amount >= minStake, "Amount below min stake");

        /*
         * SafeERC20 只保证调用没有失败，不保证 Vault 实际收到 amount。这里像合约记账前的
         * balance invariant：只有余额增量与 calldata 中的 amount 完全一致，才允许把这笔
         * 本金写入链上账本，避免收费型或异常 ERC20 用虚高名义金额买下结果。
         */
        uint256 balanceBefore = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(user, address(this), amount);
        uint256 balanceAfter = stakeToken.balanceOf(address(this));
        require(balanceAfter >= balanceBefore && balanceAfter - balanceBefore == amount, "Unexpected token transfer");
        _recordStake(user, side, amount);
    }

    function _recordStake(address user, Side side, uint256 amount) private {
        require(!resolved, "Already finalized");
        require(block.timestamp < resolutionTime, "Staking ended");

        StakeInfo storage info = _stakeOf[user];
        (Side currentSide, bool hasPosition) = sideOf(user);
        require(!hasPosition || currentSide == side, "Position is locked to one side");

        uint256 index = uint256(side);
        if (!hasPosition) {
            _participantCountBySide[index] += 1;
            _totalParticipants += 1;
        }
        uint256 newAmount = _userPrincipal(info) + amount;
        _setSideAmount(info, side, newAmount);
        _totalStakeBySide[index] += amount;
        _totalPrincipal += amount;
        emit Staked(user, side, amount, newAmount);
    }

    function _recordReview(address reviewer, Side side, string calldata review) private returns (bytes32 reviewHash) {
        require(!hasReview[reviewer], "Review already submitted");
        uint256 reviewLength = bytes(review).length;
        require(reviewLength >= MIN_REVIEW_BYTES, "Review too short");
        require(reviewLength <= MAX_REVIEW_BYTES, "Review too long");

        reviewHash = keccak256(bytes(review));
        hasReview[reviewer] = true;
        reviewHashOf[reviewer] = reviewHash;
        _reviewSideOf[reviewer] = side;
    }

    function _deriveOutcome() private view returns (Outcome) {
        if (_totalStakeBySide[0] > _totalPrincipal - _totalStakeBySide[0]) return Outcome.YES;
        if (_totalStakeBySide[1] > _totalPrincipal - _totalStakeBySide[1]) return Outcome.NO;
        return Outcome.INVALID;
    }

    function _setSideAmount(StakeInfo storage info, Side side, uint256 amount) private {
        info.yes = side == Side.YES ? amount : 0;
        info.no = side == Side.NO ? amount : 0;
        info.invalid = side == Side.INVALID ? amount : 0;
    }

    function _userPrincipal(StakeInfo storage info) private view returns (uint256) {
        return info.yes + info.no + info.invalid;
    }
}
