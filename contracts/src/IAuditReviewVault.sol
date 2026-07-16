// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Audit Review 专用 ABI。刻意不继承 IOCPVault，避免把 donate 暴露进专用 Vault。
 */
interface IAuditReviewVault {
    enum Side {
        YES,
        NO,
        INVALID
    }

    enum Outcome {
        PENDING,
        YES,
        NO,
        INVALID
    }

    function MIN_REVIEW_BYTES() external view returns (uint256);
    function MAX_REVIEW_BYTES() external view returns (uint256);
    function auditReviewVersion() external pure returns (uint256);
    function stakeToken() external view returns (IERC20);
    function resolutionTime() external view returns (uint256);
    function minStake() external view returns (uint256);
    function totalPrincipal() external view returns (uint256);
    function totalStakeYes() external view returns (uint256);
    function totalStakeNo() external view returns (uint256);
    function totalStakeInvalid() external view returns (uint256);
    function stakeOf(address user) external view returns (uint256 yes, uint256 no, uint256 invalid);
    function sideOf(address user) external view returns (Side side, bool hasPosition);
    function hasReview(address reviewer) external view returns (bool);
    function claimed(address user) external view returns (bool);
    function reviewHashOf(address reviewer) external view returns (bytes32);
    function reviewSideOf(address reviewer) external view returns (Side side);
    function resolved() external view returns (bool);
    function outcome() external view returns (Outcome);
    function canResolve() external view returns (bool);
    function settlementPool() external view returns (uint256);
    function remainingEligibleClaims() external view returns (uint256);
    function totalPaid() external view returns (uint256);

    function stake(Side side, uint256 amount) external;
    function stakeWithReview(Side side, uint256 amount, string calldata review) external;
    function addStake(uint256 amount) external;
    function bootstrapCreatorNo(address creator, uint256 amount, string calldata review) external;
    function finalize() external;
    function withdraw() external;

    event ReviewSubmitted(address indexed reviewer, Side indexed side, bytes32 indexed reviewHash, string review);
}
