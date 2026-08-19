---
title: Proposal Lifecycle
description: Learn how proposals move through the governance process, from initial signaling to final execution.
displayed_sidebar: participateSidebar
references: ["l1-contracts/src/governance/interfaces/IPayload.sol", "l1-contracts/src/governance/proposer/GovernanceProposer.sol", "l1-contracts/src/governance/proposer/EmpireBase.sol", "l1-contracts/src/governance/GSEPayload.sol", "l1-contracts/src/governance/Governance.sol"]
---

# Proposal Lifecycle

A proposal's journey from idea to execution involves multiple stages, each with specific requirements and timing constraints. This page details each stage of the lifecycle.

## Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Payload   │────▶│  Signaling  │────▶│   Queued    │────▶│   Active    │────▶│ Executable  │────▶│  Executed   │
│  Deployed   │     │  (Round)    │     │(Voting Delay│     │  (Voting)   │     │(Exec. Delay)│     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                          │                                        │
                          ▼                                        ▼
                    ┌─────────────┐                          ┌─────────────┐
                    │   Expired   │                          │  Rejected   │
                    │ (No Quorum) │                          │(Insufficient│
                    └─────────────┘                          │   Support)  │
                                                             └─────────────┘
```

## Stage 1: Payload Deployment

Before any governance process begins, someone must deploy the contracts that define what the proposal will do:

1. **New Contracts**: Deploy any new contracts the proposal requires (e.g., a new rollup version)
2. **Payload Contract**: Deploy a payload contract implementing `IPayload` that returns the actions to execute

```solidity
interface IPayload {
    struct Action {
        address target;
        bytes data;
    }

    function getActions() external view returns (Action[] memory);
}
```

For example, a payload to add a new rollup to the Registry might look like:

```solidity
contract RegisterRollupPayload is IPayload {
    IRegistry public immutable REGISTRY;
    address public immutable NEW_ROLLUP;

    constructor(IRegistry _registry, address _newRollup) {
        REGISTRY = _registry;
        NEW_ROLLUP = _newRollup;
    }

    function getActions() external view returns (Action[] memory) {
        Action[] memory actions = new Action[](1);
        actions[0] = Action({
            target: address(REGISTRY),
            data: abi.encodeWithSelector(REGISTRY.addRollup.selector, NEW_ROLLUP)
        });
        return actions;
    }
}
```

## Stage 2: Signaling

Once a payload is deployed, block producers on the canonical rollup can signal support for it.

### How Signaling Works

The Governance Proposer operates in **rounds**. Each round consists of `ROUND_SIZE` slots (e.g., 300 slots, approximately 180 minutes at 36 seconds per slot).

During each slot:
1. The Governance Proposer queries the canonical rollup for the current proposer
2. Only that proposer can successfully call `signal(payloadAddress)`
3. The signal is recorded for the current round

### Reaching Quorum

A payload reaches quorum when it receives `QUORUM` signals within a single round. For example:
- Round size: 300 slots
- Quorum: 151 signals (>50% of round size)

If multiple block proposers signal for the same payload address and it reaches 151 signals before the round ends, that payload wins the round.

### Round Expiration

If no payload reaches quorum by the end of a round:
- All signals for that round are discarded
- A new round begins
- Signaling can start fresh for any payload

## Stage 3: Proposal Submission

When a payload reaches quorum, anyone can call `submitRoundWinner()` on the Governance Proposer to formally create a proposal.

### GSE Payload Wrapping

The Governance Proposer doesn't submit the original payload directly. Instead, it wraps it in a [GSEPayload](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/GSEPayload.sol) that:

1. Copies all actions from the original payload
2. Appends an `amIValid()` validation check as the final action
3. When executed, verifies that >2/3 of total stake remains with the latest rollup

:::note Validation Timing
The GSEPayload validation runs at **execution time**, not at proposal submission. This means a proposal could pass voting but fail execution if stake distribution changes during the voting and execution delay periods.
:::

This wrapping prevents proposals that would leave the network without a supermajority of validators on the active rollup.

## Stage 4: Queued (Voting Delay)

After submission, the proposal enters a mandatory waiting period before voting opens.

- **Purpose**: Give the community time to review the proposal
- **Duration**: Configurable (e.g., 12 hours on testnet)
- **State**: Proposal exists but no votes can be cast yet

During this period:
- Anyone can review the payload code
- Community discussion can occur offchain
- Token holders can prepare their voting power

:::warning Voting Power Snapshot
Voting power is snapshotted at the moment the proposal transitions from Queued to Active. If you want to vote on a proposal, you must have deposited tokens *before* the voting delay ends.
:::

## Stage 5: Active (Voting Period)

Once the voting delay passes, the proposal becomes active and voting opens.

- **Duration**: Configurable (e.g., 24 hours on testnet)
- **Who can vote**: Anyone with voting power at the snapshot timestamp
- **Vote options**: "Yea" (support) or "Nay" (oppose)

### Voting Mechanics

- Votes are weighted by voting power at the snapshot
- Partial voting is allowed (split your power between yea and nay)
- Votes cannot be changed once cast
- The rollup contract automatically votes "yea" on proposals it signaled for

See [Voting](./voting) for complete details on voting mechanics.

## Stage 6: Resolution

When the voting period ends, the proposal's fate is determined:

### Passed
If the proposal receives sufficient support:
- "Yea" votes exceed the required threshold
- Proposal transitions to Executable state

### Rejected
If the proposal fails to gain sufficient support:
- Proposal is marked as rejected
- It cannot be executed
- A new proposal would need to go through the entire process again

## Stage 7: Executable (Execution Delay)

Proposals that pass voting enter another waiting period before execution.

- **Purpose**: Allow node operators time to prepare for changes
- **Duration**: Configurable (e.g., 12 hours on testnet)
- **State**: Approved but not yet executed

This delay is critical for upgrades because:
- Operators may need to update node software
- Services can prepare for the transition
- Any last-minute issues can be identified

## Stage 8: Execution

After the execution delay, anyone can call `execute(proposalId)` on the Governance contract.

Execution:
1. Retrieves the proposal's payload
2. Calls `getActions()` on the payload
3. Executes each action in sequence
4. Marks the proposal as executed

If any action reverts, the entire execution reverts and the proposal remains executable.

## Timeline Example (Testnet)

| Stage | Duration | Cumulative Time |
|-------|----------|-----------------|
| Signaling | Up to 1 round (~3 hours) | 3 hours |
| Voting Delay | 12 hours | 15 hours |
| Voting Period | 24 hours | 39 hours |
| Execution Delay | 12 hours | 51 hours |
| **Total** | | **~2 days minimum** |

Note: Mainnet parameters will likely be longer to provide more security.

## Escape Hatch: Propose With Lock

What if block producers cannot or will not signal for a critical proposal? The governance system includes an escape hatch.

The `proposeWithLock()` function allows anyone with sufficient voting power to bypass the signaling process:

```solidity
function proposeWithLock(IPayload _proposal, address _to) external returns (uint256);
```

This requires:
- A large amount of voting power (configured in governance)
- The power is immediately locked with a long withdrawal delay
- The proposal still goes through normal voting

This mechanism protects against governance capture while ensuring the network can always upgrade if needed.

## Related Topics

- [Voting](./voting) - Detailed voting mechanics
- [GSE and Stake Mobility](./gse) - How GSEPayload ensures stake continuity
- [Upgrades](./upgrades) - End-to-end upgrade process
