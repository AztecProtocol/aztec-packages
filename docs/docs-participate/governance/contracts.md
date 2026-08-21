---
title: L1 Contracts
description: Overview of the L1 smart contracts that power Aztec network governance.
displayed_sidebar: participateSidebar
references: ["l1-contracts/src/governance/Registry.sol", "l1-contracts/src/governance/Governance.sol", "l1-contracts/src/governance/proposer/GovernanceProposer.sol", "l1-contracts/src/governance/GSE.sol"]
---

# L1 Contracts

:::warning Work in Progress
This page provides a high-level overview of Aztec's governance contracts. The contract interfaces and implementations are still evolving. For the authoritative source, see the [l1-contracts repository](https://github.com/AztecProtocol/aztec-packages/tree/master/l1-contracts/src/governance).
:::

## Contract Overview

The Aztec governance system consists of several L1 smart contracts:

| Contract | Purpose |
|----------|---------|
| **Registry** | Tracks all rollup instances; determines which is canonical |
| **Governance** | Handles proposal voting and execution |
| **GovernanceProposer** | Manages sequencer signaling and proposal submission |
| **GSE** | Governance Staking Escrow - manages validator stakes and voting power |
| **Rollup** | The rollup contract itself; validators stake here |

## Registry

The [Registry](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/Registry.sol) maintains an append-only list of rollup instances. Only the Governance contract (as owner) can add new rollups.

Key properties:
- **Backwards compatible**: All historical rollups remain accessible
- **Canonical selection**: Only the latest rollup receives block rewards
- **Immutable entries**: Once added, rollup addresses cannot be removed

## Governance

The [Governance](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/Governance.sol) contract is the decision-making body that executes approved proposals.

Key functions:
- `deposit()` / `initiateWithdraw()` - Manage voting power
- `vote()` - Cast votes on proposals
- `execute()` - Execute approved proposals

See [Proposal Lifecycle](/participate/governance/proposal-lifecycle) for how proposals move through the system.

## GovernanceProposer

The [GovernanceProposer](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/proposer/GovernanceProposer.sol) handles the signaling phase where sequencers vote to promote payloads to proposals.

Key functions:
- `signal()` - Sequencers signal support for a payload during their slot
- `submitRoundWinner()` - Submit a payload that reached quorum as a proposal

## GSE (Governance Staking Escrow)

The [GSE](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/GSE.sol) holds validator stakes and manages voting power delegation.

Key features:
- **Stake mobility**: Stakes can automatically follow rollup upgrades
- **Voting delegation**: Validators can delegate voting power
- **Escape hatch**: `proposeWithLock()` for emergency proposals

See [GSE and Stake Mobility](/participate/governance/gse) for details.

## Related Topics

- [Governance Overview](/participate/governance) - How the governance system works
- [Proposal Lifecycle](/participate/governance/proposal-lifecycle) - Stages from signaling to execution
- [Network Upgrades](/participate/governance/upgrades) - How upgrades use these contracts
