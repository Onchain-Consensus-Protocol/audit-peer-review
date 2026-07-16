const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

export const auditConfig = {
  chainId: 8453,
  chainName: "Base",
  rpcUrl: env?.VITE_RPC_URL ?? "https://mainnet.base.org",
  explorer: "https://basescan.org",
  factoryAddress: env?.VITE_AUDIT_FACTORY_ADDRESS ?? "0xaaC1107E6FebDbA424A3477DfEEe9D8d3A58cBB7",
  factoryCodeHash: env?.VITE_AUDIT_FACTORY_CODE_HASH ?? "0xc5651f486c9f9af8c4156c7b03259ec1c0a586e879bf6329d7894c58a0ffd4e0",
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  minStake: 1_000_000n,
  minCreatorNoStake: 10_000_000n,
};

export const ERC20_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

export const FACTORY_ABI = [
  "function officialStakeToken() view returns (address)",
  "function minStake() view returns (uint256)",
  "function minCreatorNoStake() view returns (uint256)",
  "function auditReviewFactoryVersion() view returns (uint256)",
  "function isVault(address) view returns (bool)",
  "function creationBlockOf(address) view returns (uint256)",
  "function vaultCount() view returns (uint256)",
  "function vaultAt(uint256 index) view returns (address)",
  "function getDisputeMeta(address) view returns ((address creator,bytes32 claimHash,bytes32 auditHash,string auditUrl,string findingLabel,string finding,string yesRule,string noRule,string invalidRule))",
  "function createDispute((string auditUrl,bytes32 auditHash,string findingLabel,string finding,string yesRule,string noRule,string invalidRule,uint256 resolutionTime,string creatorReview,uint256 initialNoStake) params) returns (address)",
  "event AuditReviewVaultCreated(address indexed vault,address indexed creator,bytes32 indexed claimHash,uint256 resolutionTime,uint256 initialNoStake)",
] as const;

export const VAULT_ABI = [
  "function auditReviewVersion() view returns (uint256)",
  "function factory() view returns (address)",
  "function stakeToken() view returns (address)",
  "function resolutionTime() view returns (uint256)",
  "function minStake() view returns (uint256)",
  "function totalPrincipal() view returns (uint256)",
  "function totalStakeYes() view returns (uint256)",
  "function totalStakeNo() view returns (uint256)",
  "function totalStakeInvalid() view returns (uint256)",
  "function stakeOf(address) view returns (uint256,uint256,uint256)",
  "function sideOf(address) view returns (uint8,bool)",
  "function hasReview(address) view returns (bool)",
  "function claimed(address) view returns (bool)",
  "function reviewSideOf(address) view returns (uint8)",
  "function resolved() view returns (bool)",
  "function outcome() view returns (uint8)",
  "function canResolve() view returns (bool)",
  "function settlementPool() view returns (uint256)",
  "function totalPaid() view returns (uint256)",
  "function remainingEligibleClaims() view returns (uint256)",
  "function stakeWithReview(uint8 side,uint256 amount,string review)",
  "function addStake(uint256 amount)",
  "function finalize()",
  "function withdraw()",
  "event ReviewSubmitted(address indexed reviewer,uint8 indexed side,bytes32 indexed reviewHash,string review)",
  "event Staked(address indexed user,uint8 indexed side,uint256 amount,uint256 totalAmount)",
  "event Finalized(uint8 outcome,uint256 totalYes,uint256 totalNo,uint256 totalInvalid,uint256 settlementPool)",
  "event Withdrawn(address indexed user,uint256 payout)",
] as const;
