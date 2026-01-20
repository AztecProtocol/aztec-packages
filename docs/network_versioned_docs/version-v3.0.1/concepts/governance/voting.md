---
title: Voting
description: Learn how voting power works in Aztec governance, including deposits, withdrawals, delegation, and vote casting.
displayed_sidebar: conceptsSidebar
---

# Voting

Voting is how the Aztec community decides which proposals should be executed. This page explains how voting power is acquired, managed, and used.

## Voting Power

Voting power in Governance comes from depositing tokens into the Governance contract. The amount of tokens deposited equals your voting power.

### Acquiring Voting Power

To get voting power, call `deposit()` on the Governance contract:

```solidity
function deposit(address beneficiary, uint256 amount) external;
```

This:
1. Transfers tokens from `msg.sender` to the Governance contract
2. Increases the `beneficiary`'s voting power
3. Records the power with a timestamp

### Timestamped Power

Voting power is **timestamped** at the moment of deposit. This is crucial because:

- When voting on a proposal, you can only use power you had *before* the proposal became active
- This prevents flash loan attacks where someone borrows tokens just to vote
- Your current balance doesn't matter; only your historical balance at the snapshot

Example:
```
Timeline:
├── Day 1: Alice deposits 1000 tokens
├── Day 2: Proposal becomes Active (snapshot taken)
├── Day 3: Alice deposits 500 more tokens
└── Day 4: Alice votes

Alice can only vote with 1000 tokens (her balance at the Day 2 snapshot)
```

## Deposit Control

By default, not everyone can deposit into Governance. A **deposit control** mechanism restricts who can hold voting power.

### GSE as Deposit Controller

In the standard configuration, only the Governance Staking Escrow (GSE) can deposit into Governance. This means:

- Validators who stake into the rollup automatically get voting power
- The rollup contract can vote on behalf of its validators
- Non-validators cannot directly hold governance power

### Disabling Deposit Control

Governance can vote to disable deposit control, allowing anyone to hold voting power. This requires executing a proposal that calls the appropriate function on the Governance contract.

:::note Current Status
On mainnet, deposit control was disabled at launch by passing the zero address as the GSE to the Governance constructor. This means anyone can deposit tokens and participate in governance.
:::

## Withdrawing

Withdrawing voting power is a two-step process with a mandatory delay.

### Step 1: Initiate Withdrawal

Call `initiateWithdraw()` to start the withdrawal process:

```solidity
function initiateWithdraw(address to, uint256 amount) external;
```

This:
1. Reduces your voting power immediately
2. Creates a pending withdrawal record
3. Starts the withdrawal delay timer

### Step 2: Finalize Withdrawal

After the delay period passes, call `finaliseWithdraw()`:

```solidity
function finaliseWithdraw(uint256 withdrawalId) external;
```

This transfers the tokens to the specified recipient.

### Why the Delay?

The withdrawal delay (typically on the order of days) prevents governance attacks:

- Attackers cannot quickly deposit, vote, and withdraw
- The community has time to react to suspicious voting patterns
- Long-term stakeholders have more influence than short-term speculators

## Delegation

Validators can delegate their voting power to another address, allowing for flexible voting arrangements.

### Default Delegation

When a validator deposits stake into a rollup:
1. The stake is held in the GSE
2. Voting power is delegated to the rollup contract by default
3. The rollup votes automatically on proposals its block producers signaled for

### Custom Delegation

Validators can delegate to themselves or any other address:

```solidity
// On the GSE
function delegate(address rollup, address attester, address delegatee) external;
```

After delegating to yourself, you can vote directly on the GSE:

```solidity
function vote(uint256 proposalId, uint256 amount, bool support) external;
```

### Delegation Accounting

The GSE tracks: `delegatee => proposal => power used`

This allows:
- Partial voting (use some power for "yea", some for "nay")
- Split delegation (delegate to multiple addresses)
- Transparent power tracking

## Casting Votes

### Voting Through the Rollup

The rollup contract has a `vote(uint256 proposalId)` function that:

1. Checks the rollup is canonical according to the Registry
2. Verifies it was canonical when the proposal was created
3. Votes "yea" using all delegated voting power

The rollup only votes on proposals that:
- Were submitted through the Governance Proposer
- Had their block producers signal for the payload
- Match the current governance configuration

### Voting Through the GSE

If you've delegated to yourself, vote directly on the GSE:

```solidity
function vote(
    uint256 proposalId,
    uint256 amount,
    bool support  // true = yea, false = nay
) external;
```

This allows:
- Voting against proposals (the rollup always votes "yea")
- Partial voting with specific amounts
- More granular control over your voting power

## Partial Voting

You can split your voting power between "yea" and "nay" on the same proposal:

```solidity
// Vote "yea" with half your power
gse.vote(proposalId, 500, true);

// Vote "nay" with the other half
gse.vote(proposalId, 500, false);
```

This is useful when you:
- Have mixed feelings about a proposal
- Want to signal nuanced support
- Are voting on behalf of multiple stakeholders

## Vote Finality

Once cast, votes cannot be changed. Consider carefully before voting, as you cannot:
- Switch from "yea" to "nay" or vice versa
- Increase or decrease your vote amount
- Revoke your vote

## Quorum and Thresholds

For a proposal to pass, it must meet certain thresholds:

- **Participation Quorum**: Minimum total votes (yea + nay) required
- **Approval Threshold**: Minimum percentage of "yea" votes required

These parameters are configured in the Governance contract and can be changed through governance proposals.

## Timeline Considerations

| Event | Voting Power Impact |
|-------|---------------------|
| Deposit tokens | Power recorded with current timestamp |
| Proposal becomes Active | Snapshot taken of all power at this moment |
| Vote on proposal | Must have power from before the snapshot |
| Initiate withdrawal | Power reduced immediately |
| Finalize withdrawal | Tokens returned after delay |

## Related Topics

- [Proposal Lifecycle](./proposal-lifecycle) - When voting occurs in the proposal process
- [GSE and Stake Mobility](./gse) - How validator stakes translate to voting power
- [Voting on Proposals](../../users/voting) - Practical guide for token holders
