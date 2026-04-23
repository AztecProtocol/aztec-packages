---
title: Alpha Network
description: "Understand the Aztec Alpha network: its purpose, known limitations, expected issues, and what to expect as the protocol matures."
displayed_sidebar: participateSidebar
---

Alpha is the Aztec mainnet in its initial operational phase. It is live on Ethereum mainnet with real staking, governance, and user transactions. It is also early, unaudited software where bugs, including critical ones, are expected.

This page is the central reference for understanding what Alpha is, what risks come with using it, and how the network will evolve.

## What Alpha is

Alpha is the first production deployment of the Aztec rollup. Governance, staking, and block production are fully operational with real economic stakes. Sequencers must stake real tokens to participate, and governance proposals have real consequences.

However, "production" does not mean "finished." Alpha exists to:

- Battle-test the protocol under real conditions
- Establish decentralized governance and validator sets
- Identify bugs that only surface at scale or under adversarial conditions
- Build toward a mature, stable mainnet

Think of Alpha as a live stress test with real stakes. The protocol is functional, but it is not yet hardened.

## What to build on Alpha

Alpha is an experimentation phase for developers as much as it is for the protocol. This is the moment to try things that were not possible before: private smart contracts, hybrid public/private applications, novel privacy-preserving primitives, and patterns that no other chain can support.

Much like the early days of Ethereum, the applications built now will shape what Aztec becomes. Expect rough edges, breaking changes, and the need to redeploy after upgrades. In exchange, you get a first-mover opportunity to explore a new design space alongside the protocol itself. Build on [Testnet](/networks#testnet) first to iterate quickly, then deploy to Alpha when you are ready to validate against real network conditions.

## Known limitations and expected issues

See the [Limitations](/developers/docs/resources/considerations/limitations) page for the full list of current developer-facing limitations. The sections below summarize the highest-impact issues for Alpha users.

### Proving system bugs

The Aztec proving system is novel and complex. Bugs in proof generation, verification, and circuit constraints are expected during Alpha. Some circuits are still under-constrained, meaning that soundness is not fully guaranteed. In practice, this means:

- Provers may occasionally produce invalid proofs
- Proof verification on L1 may encounter edge cases
- Block production may halt temporarily while issues are diagnosed and patched

These are known risks of an early-stage ZK rollup, not unexpected failures.

### Unaudited software

No part of the Aztec stack has been fully audited. The protocol, smart contracts, client software, and cryptographic primitives are all under active development. Code is being iterated on daily and audits are ongoing. Published audit reports are available in the [Aztec audit reports repository](https://github.com/AztecProtocol/audit-reports).

### Privacy is not guaranteed

Some privacy features are still in development. Known leakage includes:

- The number of side effects in a transaction is visible (private transactions can be fingerprinted based on their side effect count)
- No privacy-preserving queries to third-party nodes exist yet
- New privacy standards for smart contract design have not been established

### Circuit and transaction limits

ZK-SNARK circuits impose hard upper bounds on what a single transaction can do, including the number of state reads and writes, notes, nullifiers, logs, and messages. Deeply nested function calls can exceed per-transaction limits. See [Limitations](/developers/docs/resources/considerations/limitations#circuit-limitations) for current constants.

## State migration and rollup upgrades

As the protocol matures, it will undergo rollup upgrades through the [governance process](/participate/governance/upgrades). When a new rollup version is deployed:

- A new rollup contract is added to the onchain Registry
- The new rollup becomes canonical (receives block rewards)
- The old rollup remains accessible for bridging assets in and out

### State migration

Migrating application state from one rollup version to another is a hard problem for any ZK rollup, and Aztec is no exception. You should expect that:

- **State does not carry over automatically.** Application data, deployed contracts, and notes on the current rollup will not be directly accessible on a new rollup version without explicit migration steps.
- **Migration tooling is still being developed.** There are no mature, battle-tested tools for migrating L2 state across rollup upgrades yet.
- **Applications will need to redeploy.** Developers should plan that contracts will need to be redeployed and state reconstructed (or omitted) after a rollup upgrade.
- **User funds are not permanently locked, but they are not immune to protocol bugs.** The Registry model ensures that users can always bridge assets out of any historical rollup version. However, a proving system bug or other protocol flaw could still allow funds to be stolen before guardrails are in place, so "not locked" is not the same as "risk-free."

If you are building on Alpha, design your application with rollup upgrades in mind. Avoid assumptions about state permanence at this stage.

For details on how rollup upgrades work, see [Network Upgrades](/participate/governance/upgrades).

## Security disclosures

We expect bugs, including critical ones, to be discovered during Alpha. Aztec is preparing a bug bounty program and actively conducts internal and external reviews.

### Reporting vulnerabilities

If you discover a security vulnerability:

1. **Do not** open a public GitHub issue or pull request
2. Use [GitHub Private Vulnerability Reporting](https://github.com/AztecProtocol/aztec-packages/security/advisories/new) to submit details
3. You can also email [security@aztec.foundation](mailto:security@aztec.foundation) (but submit full details through GitHub, not email)

Mark reports as **CRITICAL** if you believe a vulnerability is actively being exploited or could result in loss of funds, key compromise, or broad user impact.

For the full security policy, see [SECURITY.md](https://github.com/AztecProtocol/aztec-packages/blob/master/SECURITY.md).

### Non-security bugs

For bugs that are not security-sensitive (performance issues, feature requests, unexpected behavior), open a [GitHub Issue](https://github.com/AztecProtocol/aztec-packages/issues). Keeping non-security bugs public helps the community track progress and collaborate on fixes.

## Path to beta

The transition from Alpha to Beta is defined by performance milestones, not a specific calendar date. The network will be considered Beta when it consistently meets the following targets:

| Metric                     | Target     |
| -------------------------- | ---------- |
| **User-perceived latency** | 12s median |
| **Sustained throughput**   | 10 TPS     |
| **Uptime**                 | 99.9%      |

These thresholds reflect the minimum bar for a network that application developers and users can rely on for production workloads. Until they are met, expect the instability and limitations described on this page.

## What this means for you

| If you are a...            | Expect...                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Validator / Sequencer**  | Occasional downtime, software updates, and proving failures. Stay current with node releases.                                                           |
| **Developer**              | Breaking changes, API instability, and the need to redeploy after upgrades. Build on [Testnet](/networks#testnet) first, and design for impermanence.   |
| **Governance Participant** | An active role in shaping the protocol. Upgrades are real and consequential, so participate in proposals and voting.                                    |
| **User**                   | A functional but rough experience. Do not store meaningful secrets or rely on state permanence.                                                         |

## Next steps

- [Networks Overview](/networks): Technical details, RPC endpoints, and contract addresses
- [Limitations](/developers/docs/resources/considerations/limitations): Full list of current developer-facing limitations
- [Privacy Considerations](/developers/docs/resources/considerations/privacy_considerations): What leaks and what doesn't
- [Network Upgrades](/participate/governance/upgrades): How rollup upgrades work through governance
- [Security Policy](https://github.com/AztecProtocol/aztec-packages/blob/master/SECURITY.md): How to report vulnerabilities
- [Operator Guides](/operate/operators): Running network infrastructure
