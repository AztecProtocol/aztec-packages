---
title: GSE and Stake Mobility
description: Learn how the Governance Staking Escrow (GSE) enables seamless stake migration during rollup upgrades.
displayed_sidebar: participateSidebar
---

# Governance Staking Escrow (GSE)

The Governance Staking Escrow (GSE) solves a critical challenge in network upgrades: how do validators transition their stake from an old rollup to a new one without lengthy exit and entry delays?

## The Problem

When the network upgrades to a new rollup contract, validators face a dilemma:

1. Their stake is locked in the old rollup
2. Exiting the old rollup has a delay (for security)
3. Entering the new rollup has a queue
4. During this transition, they can't validate on either rollup

Without a solution, upgrades would cause significant disruption as the validator set scrambles to migrate.

## The Solution: GSE

The GSE acts as a neutral escrow that holds validator stakes on behalf of rollup contracts. Instead of validators depositing directly into each rollup, they deposit into the GSE, which:

1. Tracks stakes per validator per rollup
2. Allows stakes to automatically move with rollup upgrades
3. Maintains voting power delegation for governance
4. Enables seamless transitions between rollup versions

## How It Works

### Depositing with Move Flag

When a validator deposits stake, they choose whether their stake should follow upgrades:

```solidity
function deposit(
    address _attester,
    address _withdrawer,
    bool _moveWithLatestRollup
) external;
```

The `_moveWithLatestRollup` flag determines stake behavior:

| Flag Value | Behavior |
|------------|----------|
| `false` | Stake is tied to the specific rollup address |
| `true` | Stake follows the "latest" rollup automatically |

### The Bonus Instance

The GSE uses a special address called the "bonus instance" to track stakes that should move:

```solidity
address public constant BONUS_INSTANCE_ADDRESS =
    address(uint160(uint256(keccak256("bonus-instance"))));
```

This is the one exception where "instance" doesn't refer to a rollup contract—it's a virtual address for accounting purposes.

### Stake Visibility

When the GSE determines which validators have stake in a rollup:

- Stakes deposited with `_moveWithLatestRollup = false` are tied to that rollup's address
- Stakes deposited with `_moveWithLatestRollup = true` are tied to the bonus instance
- Only the **latest** rollup in the GSE can access stakes from the bonus instance

### Example Scenario

```
Initial State:
├── Rollup A is canonical
├── Alice deposits 100 tokens (moveWithLatest = false)
├── Bob deposits 100 tokens (moveWithLatest = true)
└── Both can validate on Rollup A

After Upgrade to Rollup B:
├── Rollup B is now canonical
├── Alice's stake: Still on Rollup A only
├── Bob's stake: Now available to Rollup B
├── Alice must manually exit A and enter B
└── Bob validates on B immediately
```

## GSE Payload Verification

When the Governance Proposer wraps payloads in a [GSEPayload](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/GSEPayload.sol), it adds checks to ensure the new rollup has sufficient stake:

After executing the original payload actions, the GSEPayload verifies:

```
(stake in latest rollup) + (stake in bonus instance) > 2/3 of total stake
```

This prevents proposals that would leave the network without a supermajority of validators on the active rollup.

### Why This Matters

Without this check:
- A malicious proposal could switch to a rollup with zero validators
- Block production would halt
- The network couldn't even propose a fix through governance

The GSEPayload ensures continuity of the validator set across upgrades.

## GSE Accounting

The GSE maintains several pieces of information per rollup:

### Per Validator (Attester)
- Balance in the rollup
- Withdrawer address (who can initiate withdrawals)
- Delegation target (who votes with their power)

### Per Rollup
- Total stake deposited
- Entry/exit queues
- Latest rollup pointer

### For Governance
- Voting power per delegatee
- Power used per proposal
- Timestamp snapshots for voting

## Voting Power Delegation

By default, when validators deposit stake:

1. Their voting power is delegated to the rollup contract
2. The rollup votes "yea" on proposals its block producers signaled for
3. This creates automatic alignment between validators and governance

### Custom Delegation

Validators can change their delegation:

```solidity
function delegate(
    address _rollup,
    address _attester,
    address _delegatee
) external;
```

Requirements:
- Must be called by the withdrawer
- Delegatee can be any address (including the validator themselves)
- Once delegated, the delegatee can vote directly through the GSE

### Voting Through GSE

After custom delegation, validators can vote directly:

```solidity
function vote(
    uint256 _proposalId,
    uint256 _amount,
    bool _support
) external;
```

This allows:
- Voting against proposals (rollups always vote "yea")
- Partial voting with specific amounts
- More granular control

## Propose With Lock

The GSE provides an escape hatch for creating proposals without sequencer signaling:

```solidity
function proposeWithLock(IPayload _payload, address _to) external returns (uint256);
```

This function:
1. Takes tokens from `msg.sender`
2. Deposits them into Governance
3. Calls `proposeWithLock` on Governance
4. Creates a proposal with a long withdrawal lock

The long lock prevents governance attacks while ensuring the network can always upgrade if needed.

## State Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                         GSE State                                │
├─────────────────────────────────────────────────────────────────┤
│  Rollup A (old)           │  Bonus Instance    │  Rollup B (new) │
│  ─────────────────        │  ───────────────   │  ────────────── │
│  Alice: 100               │  Bob: 100          │  (empty)        │
│                           │                    │                 │
│  Access: Rollup A only    │  Access: Latest    │  Access: B only │
└─────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼ (Upgrade to B)
┌─────────────────────────────────────────────────────────────────┐
│  Rollup A (old)           │  Bonus Instance    │  Rollup B (new) │
│  ─────────────────        │  ───────────────   │  ────────────── │
│  Alice: 100               │  Bob: 100          │  (empty)        │
│                           │        │           │                 │
│  Alice validates on A     │        └───────────┼──▶ Bob can      │
│  (must exit to move)      │                    │     validate    │
└─────────────────────────────────────────────────────────────────┘
```

## Best Practices

### For Validators

1. **Use `moveWithLatestRollup = true`** if you want automatic migration
2. **Delegate to yourself** if you want to vote independently
3. **Monitor governance proposals** even if your stake moves automatically

### For Governance Proposals

1. **Ensure new rollups use the same GSE** for stake continuity
2. **Test that sufficient stake will be available** before signaling
3. **Allow time for validators to prepare** before execution

## Related Topics

- [Voting](./voting) - How voting power and delegation work
- [Proposal Lifecycle](./proposal-lifecycle) - How GSEPayload wrapping fits in
- [Upgrades](./upgrades) - End-to-end upgrade process
- [Staking Tokens](/participate/token/staking) - How staking works at the protocol level
