# Audit Review Peer Review

Experimental OCP subproject for evidence-gated smart-contract audit disputes.

## Scope

- `contracts/src/AuditReviewVault.sol`: specialized Vault. A reviewer's first stake must include a 200–4096 byte public review. The address is then locked to that side; later capital is added with `addStake(amount)`.
- `contracts/test/AuditReviewVault.t.sol`: review gating, direction locking, byte boundaries, rollback, outcome, and settlement tests.
- `frontend/audit-review.html`: creates the disputed audit claim prototype.
- `frontend/review-stake.html`: reviewer-facing Review + Stake prototype.

The specialized Vault is an independent copy-based variant whose outcome and settlement algorithms follow OCP Vault v4 while its ABI is intentionally incompatible with generic v4. It uses `auditReviewVersion() == 1`, does not modify the separate `Onchain-Consensus-Protocol/ocp-core` repository, and removes the generic `donate` entry point. Core fixes must therefore be reviewed and synchronized into this project explicitly.

## Local checks

```bash
cd contracts
forge test

cd ../frontend
npm run dev
```

Then open:

```text
http://127.0.0.1:5174/review-stake.html
```

## Base Sepolia deployment

- App: `https://peer-review.ocp-protocol.org`
- Factory: `0x9749F190b55b8B1fF602BCbdE9D0A504165725D0`
- Test USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Chain ID: `84532`
- Minimum stake: `1 USDC`
- Creator minimum initial NO stake: `10 USDC`
- Review period: any future timestamp

The Factory and frontend are deployed for public testnet use. OCP Core lives in the separate `Onchain-Consensus-Protocol/ocp-core` repository and is not modified by this experiment.

BaseScan source verification is complete for the current Factory.
