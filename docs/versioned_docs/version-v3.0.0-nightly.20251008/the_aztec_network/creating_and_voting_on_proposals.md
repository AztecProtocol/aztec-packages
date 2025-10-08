---
id: creating_and_voting_on_proposals
sidebar_position: 4
title: Governance and Proposal Process
description: Learn how to participate in protocol governance as a sequencer, including signaling support, creating proposals, and voting
---

## Overview

This guide shows you how to participate in protocol governance as a sequencer. You'll learn how to signal support for protocol upgrades, create proposals, and vote on governance decisions that shape the Aztec network.

## Prerequisites

Before proceeding, you should:

- Have a running sequencer node (see [Sequencer Setup Guide](./guides/run_nodes/how_to_run_sequencer.md))
- Have a basic understanding of Aztec's governance model and voting mechanisms

## Understanding Governance Components

### Payloads

Protocol upgrades consist of a series of commands that execute on protocol contracts or replace contract references. You define these steps in a contract called a **payload** that you deploy on Ethereum.

This guide assumes the payload already exists at a known address. You'll participate in the payload's journey through signaling, proposal creation, voting, and execution.

:::warning Always Verify Payloads
Before signaling support or voting, always:
1. Verify the payload address on Etherscan or your preferred block explorer
2. Review the `getActions()` function to understand what changes the payload will make
3. Check if the payload has been audited (if applicable)
4. Discuss the proposal with the community on [Aztec Discord](https://discord.gg/aztec)

Never signal or vote for a payload you haven't personally verified.
:::

Here's an example payload structure:

```solidity
contract UpgradePayload is IPayload {
  IRegistry public immutable REGISTRY;
  address public NEW_ROLLUP = address(new FakeRollup());

  constructor(IRegistry _registry) {
    REGISTRY = _registry;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](1);

    res[0] = Action({
      target: address(REGISTRY),
      data: abi.encodeWithSelector(REGISTRY.addRollup.selector, NEW_ROLLUP)
    });

    return res;
  }

  function getURI() external pure override(IPayload) returns (string memory) {
    return "UpgradePayload";
  }
}
```

If this payload's proposal passes governance voting, the governance contract executes `addRollup` on the `Registry` contract.

### Contract Addresses

Key contracts you'll use:
- **Governance Proposer**: Handles payload signaling and proposal creation
- **Governance Staking Escrow (GSE)**: Manages stake delegation and voting
- **Governance**: Executes approved proposals
- **Rollup**: Your sequencer stakes here and defaults to delegating voting power here

### Governance Lifecycle Overview

The governance process follows these stages:

1. **Signaling**: Sequencers signal support for a payload when proposing blocks. A payload needs a quorum of support to be promoted to a proposal
2. **Proposal Creation**: After reaching quorum, anyone can submit the payload as an official proposal.
3. **Voting Delay**: A mandatory waiting period before voting opens (allows time for community review).
4. **Voting Period**: Users who hold stake in the network vote on the proposal using their staked tokens.
5. **Execution Delay**: After passing the vote, another mandatory delay before execution (allows time for node upgrades).
6. **Execution**: Anyone can execute the proposal, which applies the changes.

## Signaling Support for a Payload

As a sequencer, you initiate proposals through signaling. When you propose a block, you can automatically signal support for a specific payload. Once enough sequencers signal support within a round, the payload qualifies to become an official proposal.

### How Signaling Works

- Only you can signal during slots when you're the block proposer
- Your sequencer node automatically calls `signal` on the `GovernanceProposer` contract when proposing a block (if you've configured a payload address)
- Rounds consist of 1000 slots each. At every 1000-block boundary, the system checks if any payload has received 750 or more signals (the quorum threshold, which is 75% of the round size)
- Payloads that reach quorum can be submitted as official proposals by anyone

:::note
Round size and quorum threshold will change between testnet and ignition. These values and any further references to these values are relevant for testnet only.
:::

### Configure Your Signaling Preference

Use the `setConfig` method on your node's admin interface to specify which payload address you want to signal support for.

Call the JSON-RPC interface:

```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "method":"nodeAdmin_setConfig",
    "params":[{"governanceProposerPayload":"0x1234567890abcdef1234567890abcdef12345678"}],
    "id":1
  }'
```

Replace `0x1234567890abcdef1234567890abcdef12345678` with your actual payload contract address.

Expected response:
```json
{"jsonrpc":"2.0","result":true,"id":1}
```

Once configured, your sequencer automatically signals support for this payload each time you propose a block. Each signal counts toward the quorum requirement.

## Creating a Proposal

Once a payload receives the required quorum (750 signals in a 1000-slot round), you or any user can call `submitRoundWinner` on the `GovernanceProposer` contract to officially create the proposal.

### Submit the Payload

```bash
cast send [GOVERNANCE_PROPOSER_ADDRESS] \
  "submitRoundWinner(uint256)" [ROUND_NUMBER] \
  --rpc-url [YOUR_RPC_URL] \
  --private-key [YOUR_PRIVATE_KEY]
```

To find the current round number:
```bash
# Get the current round from the GovernanceProposer contract
cast call [GOVERNANCE_PROPOSER_ADDRESS] \
  "getCurrentRound()" \
  --rpc-url [YOUR_RPC_URL]
```

### Verify the Created Proposal

After creation, you can query the proposal in the governance contract:

```bash
# Get the total proposal count
cast call [GOVERNANCE_CONTRACT_ADDRESS] \
  "proposalCount()" \
  --rpc-url [YOUR_RPC_URL]

# Query the latest proposal (count - 1, since proposals are zero-indexed)
cast call [GOVERNANCE_CONTRACT_ADDRESS] \
  "proposals(uint256)" $((PROPOSAL_COUNT - 1)) \
  --rpc-url [YOUR_RPC_URL]
```

This returns the `CompressedProposal` struct data, which includes:
- The payload address
- Creation timestamp
- Voting start and end times
- Current vote tallies

## Voting on Proposals

Once a payload becomes a proposal, there's a mandatory waiting period before voting opens. You can vote in two ways: through default delegation to the rollup contract, or by delegating to an address you control for custom voting.

### Default Voting Through the Rollup

By default, when you stake as a sequencer, you delegate your voting power to the rollup contract through the GSE (Governance Staking Escrow). The rollup automatically votes "yea" on proposals created through the `GovernanceProposer` using **all** delegated stake from **all** sequencers in that rollup.

**Key points:**
- If you signaled for a payload, your stake votes "yea" automatically—no additional action needed
- If you didn't signal but other sequencers did, your stake still votes "yea" when the rollup votes
- To vote differently, you must change your delegation before voting opens (see Custom Voting below)

Anyone can trigger the rollup vote:

```bash
cast send [ROLLUP_ADDRESS] \
  "vote(uint256)" [PROPOSAL_ID] \
  --rpc-url [YOUR_RPC_URL] \
  --private-key [YOUR_PRIVATE_KEY]
```

### Custom Voting: Delegating to Your Own Address

If you want to vote differently on a proposal (for example, to vote "nay" or to split your voting power), you can delegate your stake to an address you control. This removes your stake's voting power from the rollup's control and gives it to your chosen address.

:::warning Voting Power Timestamp
Voting power is timestamped at the moment a proposal becomes "active" (when the voting period opens). You must complete delegation **before** the voting period begins to use your voting power for that proposal.

Check the proposal's voting start time and delegate well in advance.
:::

#### Step 1: Delegate Your Stake

Use the GSE contract to delegate to an address you control:

```bash
cast send [GSE_ADDRESS] \
  "delegate(address,address,address)" \
  [ROLLUP_ADDRESS] \
  [YOUR_ATTESTER_ADDRESS] \
  [YOUR_DELEGATEE_ADDRESS] \
  --rpc-url [YOUR_RPC_URL] \
  --private-key [YOUR_WITHDRAWER_PRIVATE_KEY]
```

- `[ROLLUP_ADDRESS]`: The rollup contract where you staked
- `[YOUR_ATTESTER_ADDRESS]`: Your sequencer's attester address
- `[YOUR_DELEGATEE_ADDRESS]`: The address that will vote (often the same as your attester address, or another address you control)
- You must sign this transaction with your **withdrawer** private key (the withdrawer that you specified when you initially deposited to the rollup)

#### Step 2: Vote Through GSE

Once you've delegated to an address you control, that address can vote directly on proposals:

```bash
# Vote "yea" with your voting power
cast send [GSE_ADDRESS] \
  "vote(uint256,uint256,bool)" \
  [PROPOSAL_ID] \
  [AMOUNT] \
  true \
  --rpc-url [YOUR_RPC_URL] \
  --private-key [YOUR_DELEGATEE_PRIVATE_KEY]
```

- `[AMOUNT]`: The amount of voting power to use (can be your full stake or a partial amount)
- You can vote multiple times with different amounts to split your voting power between "yea" and "nay" if desired
- To vote "nay" with your voting power, set the boolean in the code above to false

#### Step 3: Verify Your Vote

Check that your vote was recorded:

```bash
# Check vote counts for a proposal
# Note: This returns the proposal's vote tallies from the Governance contract, not GSE
cast call [GOVERNANCE_CONTRACT_ADDRESS] \
  "getProposal(uint256)" [PROPOSAL_ID] \
  --rpc-url [YOUR_RPC_URL]
```

This returns the current "yea" and "nay" vote tallies.

## Executing Proposals

When a proposal receives sufficient support, it passes. After passing, there's another mandatory delay before the proposal becomes executable. Once executable, anyone can trigger execution.

### Execute the Proposal

Once the proposal state is Executable, anyone can execute it:

```bash
cast send [GOVERNANCE_CONTRACT_ADDRESS] \
  "execute(uint256)" [PROPOSAL_ID] \
  --rpc-url [YOUR_RPC_URL] \
  --private-key [YOUR_PRIVATE_KEY]
```

After execution, the governance contract performs all actions defined in the payload. The protocol changes become effective immediately.

### Upgrade Your Node

**Critical**: Once a proposal executes, you must upgrade your node software to track the protocol changes.

Monitor proposals closely from the signaling stage through execution. When a vote passes, prepare to upgrade your node software during the execution delay period, so you're ready when the proposal becomes effective. In practice, this often means running multiple nodes, with one node being on the version upgraded from, and one being on the version being upgraded to.

## Troubleshooting

### My Signal Isn't Being Recorded

**Symptoms**: You configured a payload address, but the signal count isn't increasing.

**Solutions**:
1. Verify you're actually proposing blocks in slots assigned to you
2. Check your node logs for errors related to governance signaling
3. Verify the payload address is correct and matches the format (0x...)
4. Confirm the `GovernanceProposer` contract address is correct for your network

### I Can't Delegate My Voting Power

**Symptoms**: Delegation transaction fails or reverts.

**Solutions**:
1. Verify you're using your **withdrawer** private key, not your attester key
2. Confirm you have stake deposited in the rollup
3. Check that the addresses are correct (rollup, attester, delegatee)
4. Ensure the rollup address matches where you actually staked

### My Vote Transaction Fails

**Symptoms**: Vote transaction reverts or fails.

**Solutions**:
1. Check the proposal is in the "Active" state (voting period is open)
2. Verify you delegated before the voting period started (voting power is timestamped)
3. Confirm you have sufficient voting power (check your stake amount)
4. Ensure you're not trying to vote with more power than you have
5. Check you're using the correct private key (delegatee key, not withdrawer)

### How Do I Check When Voting Opens?

Query the proposal to see the voting timeline:

```bash
cast call [GOVERNANCE_CONTRACT_ADDRESS] \
  "proposals(uint256)" [PROPOSAL_ID] \
  --rpc-url [YOUR_RPC_URL]
```

The returned data includes timestamps for:
- Voting start time
- Voting end time

## Summary

As a sequencer participating in governance:

1. **Signal support**: Configure your node with a payload address. Your node automatically signals when proposing blocks.
2. **Vote**: Your delegated stake automatically votes "yea" on proposals created through sequencer signaling. You don't need to take additional action if you support the proposal. To vote differently, delegate your stake to an address you control before voting opens, then vote directly through the GSE contract.
3. **Upgrade promptly**: Monitor proposals and upgrade your node software after execution to stay in sync with protocol changes.

## Next Steps

- Learn about [sequencer management](./guides/run_nodes/how_to_run_sequencer.md) for operating your node
- Join the [Aztec Discord](https://discord.gg/aztec) to participate in governance discussions and stay informed about upcoming proposals
