# Audit Review Peer Review

OCP capital-weighted public signal for smart-contract audit disputes.

## Scope

- `contracts/src/AuditReviewVault.sol`: specialized Vault. A reviewer's first stake must include a 200–4096 byte public review. The address is then locked to that side; later capital is added with `addStake(amount)`.
- `contracts/test/AuditReviewVault.t.sol`: review gating, direction locking, byte boundaries, rollback, outcome, and settlement tests.
- `frontend/audit-review.html`: creates the disputed audit claim prototype.
- `frontend/review-stake.html`: reviewer-facing Review + Stake prototype.

The specialized Vault is an independent copy-based variant whose outcome and settlement algorithms follow OCP Vault v4 while its ABI is intentionally incompatible with generic v4. It uses `auditReviewVersion() == 2`, does not modify the separate `Onchain-Consensus-Protocol/ocp-core` repository, and removes the generic `donate` entry point. Core fixes must therefore be reviewed and synchronized into this project explicitly.

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

## Base mainnet deployment

- App: `https://peer-review.ocp-protocol.org`
- Factory v2: `0xaaC1107E6FebDbA424A3477DfEEe9D8d3A58cBB7`
- Base USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Chain ID: `8453`
- Minimum stake: `1 USDC`
- Creator minimum initial NO stake: `10 USDC`
- Review period: any future timestamp

The immutable deployment record, transaction, runtime code hash, and compiler settings are in `deployments/base.json`. The Factory source is verified on BaseScan.

This mechanism is a capital-weighted public signal, not a technical audit verdict. Positions are locked to one side until settlement and non-winning principal can be lost in full.
