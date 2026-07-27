---
title: Governance Overview
description: Learn how the Aztec network is governed through onchain voting, sequencer signaling, and stake-based voting power.
displayed_sidebar: participateSidebar
---

import Image from "@theme/IdealImage";

# Governance

The Aztec network is governed by its community through an onchain governance system. This system allows the network to upgrade rollup contracts, adjust parameters, and evolve over time while maintaining security and decentralization.

## Quick summary for token holders

If you're a token holder looking to participate in governance, here's what you need to know:

| Your Situation | How to Participate | What Happens |
|----------------|-------------------|--------------|
| **I have staked tokens** (as sequencer or delegator) | Nothing required - you're already participating | Your voting power is automatically delegated to the rollup, which votes "yea" on proposals that passed sequencer signaling |
| **I want to vote differently than the default** | Delegate your voting power to yourself | You can cast your own votes on proposals |
| **I have tokens but haven't staked** | Lock tokens in the Governance contract | You gain voting power without staking rewards or slashing risk |

For step-by-step instructions, see [Voting on Proposals](/participate/token/voting).

## Design goals

The governance system is designed around two core requirements:

1. **Backwards Compatibility**: Users must always be able to bridge assets in and out of any rollup version that has ever existed
2. **Canonical Rewards**: Only the most recent (canonical) rollup should receive block rewards

These goals shape the entire governance architecture, from how rollups are tracked to how upgrades are proposed and executed.

## How governance works

<Image img={require("@site/static/img/governance.png")} />

Governance follows a multi-stage process:

1. **Signaling**: Block producers on the canonical rollup signal support for a payload by calling `signal()` on the Governance Proposer during their assigned slots
2. **Quorum**: When enough signals are received within a round (600 out of 1,000 slots on mainnet), the payload qualifies for proposal
3. **Proposal Creation**: Anyone can call `submitRoundWinner()` to formally submit the payload as a proposal to Governance
4. **Voting**: Token holders vote on the proposal using their voting power (determined at the moment voting opens)
5. **Execution**: After the voting period and execution delay, anyone can trigger execution of approved proposals

All signaling and voting happen on L1 (Ethereum).

## Core contracts

The governance system consists of several interconnected smart contracts:

### Registry

The [Registry](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/Registry.sol) maintains a list of all rollup contract instances. The most recent entry is considered "canonical" and is eligible to receive block rewards. The Registry's `addRollup()` function can only be called by the Governance contract.

### Governance

The [Governance](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/Governance.sol) contract is the core of the system. It:

- Receives proposals from the Governance Proposer
- Tracks proposal state through their lifecycle
- Manages voting power through deposits and withdrawals
- Executes approved proposals

### Governance Proposer

The [Governance Proposer](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/proposer/GovernanceProposer.sol) is the gateway for submitting proposals. Only this contract can propose to Governance, ensuring that proposals have community support before entering the voting phase.

The Governance Proposer extends the [EmpireBase](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/proposer/EmpireBase.sol) contract, which implements the round-based signaling mechanism.

### Governance Staking Escrow (GSE)

The [GSE](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/GSE.sol) bridges staking and governance. It:

- Holds validator stakes on behalf of rollup contracts
- Tracks voting power delegation
- Enables stake to automatically move to new rollup versions
- Allows validators to vote independently or delegate to the rollup

See [GSE and Stake Mobility](/participate/governance/gse) for details.

## Key concepts

### Payloads

A **payload** is a contract that defines the actions to be executed if a proposal passes. Payloads implement the [IPayload](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/interfaces/IPayload.sol) interface, which has a `getActions()` function returning a list of calls to make.

For example, a payload to register a new rollup would include a call to `Registry.addRollup(newRollupAddress)`.

### Rounds and slots

The signaling system operates in **rounds**, where each round consists of a fixed number of **slots** (1,000 slots per round on mainnet, 100 on testnet). A slot is 72 seconds of L2 time, so a mainnet round lasts about 20 hours.

During each slot, only the designated block proposer can signal for a payload. This prevents timing games and ensures signaling reflects genuine validator support.

### Quorum

For a payload to become a proposal, it must receive signals from a quorum of slots within a single round. With mainnet's quorum of 600 out of 1,000 slots, at least 600 block-proposer slots must signal for the same payload address within one round.

### Voting power

Voting power in Governance comes from depositing tokens. Key points:

- Power is timestamped at deposit time
- When voting on a proposal, only power you had *before* the proposal became active counts
- Withdrawing requires a two-step process with a delay (~9.6 days on mainnet)
- Partial voting is allowed (e.g., vote "yea" with half your power, "nay" with the other half)

## Topics in this section

- [Proposal Lifecycle](/participate/governance/proposal-lifecycle) - The complete journey from payload to execution
- [Voting](/participate/governance/voting) - How voting power works and how votes are cast
- [GSE and Stake Mobility](/participate/governance/gse) - How the GSE enables seamless rollup upgrades
- [Upgrades](/participate/governance/upgrades) - The end-to-end process for network upgrades
- [L1 Contracts](/participate/governance/contracts) - Smart contracts that power governance

## Related guides

:::tip For Sequencer Operators
To participate in governance as a sequencer (signaling and voting), see [Governance Participation](/operate/operators/sequencer-management/creating_and_voting_on_proposals).
:::

:::tip For Token Holders
To vote on proposals with your staked tokens, see [Voting on Proposals](/participate/token/voting).
:::
