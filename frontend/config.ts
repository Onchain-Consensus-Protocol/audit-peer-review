const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

export const auditConfig = {
  chainId: 84532,
  chainName: "Base Sepolia",
  rpcUrl: env?.VITE_RPC_URL ?? "https://sepolia.base.org",
  explorer: "https://sepolia.basescan.org",
  factoryAddress: env?.VITE_AUDIT_FACTORY_ADDRESS ?? "0x9749F190b55b8B1fF602BCbdE9D0A504165725D0",
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
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
  "function isVault(address) view returns (bool)",
  "function vaultCount() view returns (uint256)",
  "function vaultAt(uint256 index) view returns (address)",
  "function getDisputeMeta(address) view returns ((address creator,bytes32 claimHash,string auditUrl,string findingLabel,string finding,string yesRule,string noRule,string invalidRule))",
  "function createDispute((string auditUrl,string findingLabel,string finding,string yesRule,string noRule,string invalidRule,uint256 resolutionTime,string creatorReview,uint256 initialNoStake) params) returns (address)",
  "event AuditReviewVaultCreated(address indexed vault,address indexed creator,bytes32 indexed claimHash,uint256 resolutionTime,uint256 initialNoStake)",
] as const;

export const VAULT_ABI = [
  "function factory() view returns (address)",
  "function stakeToken() view returns (address)",
  "function resolutionTime() view returns (uint256)",
  "function minStake() view returns (uint256)",
  "function totalPrincipal() view returns (uint256)",
  "function totalStakeYes() view returns (uint256)",
  "function totalStakeNo() view returns (uint256)",
  "function totalStakeInvalid() view returns (uint256)",
  "function stakeOf(address) view returns (uint256,uint256,uint256)",
  "function hasReview(address) view returns (bool)",
  "function reviewSideOf(address) view returns (uint8)",
  "function resolved() view returns (bool)",
  "function outcome() view returns (uint8)",
  "function canResolve() view returns (bool)",
  "function stakeWithReview(uint8 side,uint256 amount,string review)",
  "function addStake(uint256 amount)",
  "function finalize()",
  "function withdraw()",
  "event ReviewSubmitted(address indexed reviewer,uint8 indexed side,bytes32 indexed reviewHash,string review)",
  "event Staked(address indexed user,uint8 indexed side,uint256 amount,uint256 totalAmount)",
  "event Finalized(uint8 outcome,uint256 totalYes,uint256 totalNo,uint256 totalInvalid)",
  "event Withdrawn(address indexed user,uint256 payout)",
] as const;
