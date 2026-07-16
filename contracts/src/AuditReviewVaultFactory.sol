// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AuditReviewVault.sol";

contract AuditReviewVaultFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_AUDIT_URL_BYTES = 2048;
    uint256 public constant MAX_FINDING_LABEL_BYTES = 160;
    uint256 public constant MAX_FINDING_BYTES = 4096;
    uint256 public constant MAX_RULE_BYTES = 1200;

    IERC20 public immutable officialStakeToken;
    uint256 public immutable minStake;
    uint256 public immutable minCreatorNoStake;

    struct DisputeMeta {
        address creator;
        bytes32 claimHash;
        bytes32 auditHash;
        string auditUrl;
        string findingLabel;
        string finding;
        string yesRule;
        string noRule;
        string invalidRule;
    }

    struct CreateParams {
        string auditUrl;
        bytes32 auditHash;
        string findingLabel;
        string finding;
        string yesRule;
        string noRule;
        string invalidRule;
        uint256 resolutionTime;
        string creatorReview;
        uint256 initialNoStake;
    }

    address[] private _vaults;
    mapping(address => bool) public isVault;
    mapping(address => uint256) public creationBlockOf;
    mapping(address => DisputeMeta) private _metaByVault;

    event AuditReviewVaultCreated(
        address indexed vault,
        address indexed creator,
        bytes32 indexed claimHash,
        uint256 resolutionTime,
        uint256 initialNoStake
    );

    constructor(address officialStakeToken_, uint256 minStake_, uint256 minCreatorNoStake_) {
        require(officialStakeToken_ != address(0), "Invalid token");
        require(officialStakeToken_.code.length > 0, "Token has no code");
        require(minStake_ > 0, "Invalid min stake");
        require(minCreatorNoStake_ >= minStake_, "Creator stake below min");
        officialStakeToken = IERC20(officialStakeToken_);
        minStake = minStake_;
        minCreatorNoStake = minCreatorNoStake_;
    }

    function auditReviewFactoryVersion() external pure returns (uint256) {
        return 2;
    }

    function createDispute(CreateParams calldata params) external nonReentrant returns (address vaultAddr) {
        _validateMetadata(params);
        // 评审窗口由创建者自行决定；协议只拒绝已经到期的 Vault。
        require(params.resolutionTime > block.timestamp, "Resolution time must be future");
        require(params.initialNoStake >= minCreatorNoStake, "Creator NO stake too low");

        bytes32 claimHash = keccak256(
            abi.encode(
                uint256(2),
                params.auditUrl,
                params.auditHash,
                params.findingLabel,
                params.finding,
                params.yesRule,
                params.noRule,
                params.invalidRule
            )
        );
        AuditReviewVault vault =
            new AuditReviewVault(address(this), address(officialStakeToken), params.resolutionTime, minStake);
        vaultAddr = address(vault);

        /*
         * 新 Vault 的首笔资金也必须满足“实收金额 == 记账金额”。若官方 Token 配置错误、
         * 带手续费或出现异常返回，Factory 会在注册 Vault 前整体回滚。
         */
        uint256 balanceBefore = officialStakeToken.balanceOf(vaultAddr);
        officialStakeToken.safeTransferFrom(msg.sender, vaultAddr, params.initialNoStake);
        uint256 balanceAfter = officialStakeToken.balanceOf(vaultAddr);
        require(
            balanceAfter >= balanceBefore && balanceAfter - balanceBefore == params.initialNoStake,
            "Unexpected token transfer"
        );
        vault.bootstrapCreatorNo(msg.sender, params.initialNoStake, params.creatorReview);

        _vaults.push(vaultAddr);
        isVault[vaultAddr] = true;
        creationBlockOf[vaultAddr] = block.number;
        _metaByVault[vaultAddr] = DisputeMeta({
            creator: msg.sender,
            claimHash: claimHash,
            auditHash: params.auditHash,
            auditUrl: params.auditUrl,
            findingLabel: params.findingLabel,
            finding: params.finding,
            yesRule: params.yesRule,
            noRule: params.noRule,
            invalidRule: params.invalidRule
        });
        emit AuditReviewVaultCreated(vaultAddr, msg.sender, claimHash, params.resolutionTime, params.initialNoStake);
    }

    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }

    function vaultAt(uint256 index) external view returns (address) {
        return _vaults[index];
    }

    function getDisputeMeta(address vault) external view returns (DisputeMeta memory) {
        require(isVault[vault], "Unknown vault");
        return _metaByVault[vault];
    }

    function _validateMetadata(CreateParams calldata params) private pure {
        _requireLength(params.auditUrl, 1, MAX_AUDIT_URL_BYTES, "Invalid audit URL length");
        require(_hasAllowedAuditUrlScheme(params.auditUrl), "Audit URL must be HTTPS or IPFS");
        require(params.auditHash != bytes32(0), "Audit hash required");
        _requireLength(params.findingLabel, 1, MAX_FINDING_LABEL_BYTES, "Invalid finding label length");
        _requireLength(params.finding, 1, MAX_FINDING_BYTES, "Invalid finding length");
        _requireLength(params.yesRule, 1, MAX_RULE_BYTES, "Invalid YES rule length");
        _requireLength(params.noRule, 1, MAX_RULE_BYTES, "Invalid NO rule length");
        _requireLength(params.invalidRule, 1, MAX_RULE_BYTES, "Invalid INVALID rule length");
    }

    function _requireLength(string calldata value, uint256 min, uint256 max, string memory errorMessage) private pure {
        uint256 length = bytes(value).length;
        require(length >= min && length <= max, errorMessage);
    }

    function _hasAllowedAuditUrlScheme(string calldata value) private pure returns (bool) {
        bytes calldata raw = bytes(value);
        return _startsWith(raw, bytes("https://")) || _startsWith(raw, bytes("ipfs://"));
    }

    function _startsWith(bytes calldata value, bytes memory prefix) private pure returns (bool) {
        if (value.length < prefix.length) return false;
        for (uint256 i = 0; i < prefix.length; ++i) {
            if (value[i] != prefix[i]) return false;
        }
        return true;
    }
}
