---
title: Staking Tokens
description: Learn how to stake tokens on the Aztec network to participate in network security and earn rewards.
displayed_sidebar: participateSidebar
references: ["l1-contracts/src/core/libraries/rollup/StakingLib.sol", "l1-contracts/src/core/libraries/StakingQueue.sol", "l1-contracts/src/governance/GSE.sol", "l1-contracts/src/governance/libraries/ConfigurationLib.sol"]
---

# Staking Tokens

Staking allows you to participate in securing the Aztec network while earning rewards. This guide explains how staking works and how to get started.

## Before You Stake

Understanding these concepts will help you make informed decisions:

- [Blocks and Epochs](/participate/basics/blocks) - how block production works
- [Economics & Rewards](/participate/token/economics) - how rewards are distributed

## Overview

When you stake tokens on the Aztec network, your tokens are locked in a smart contract and used to secure the network. In return, you earn a share of the network rewards proportional to your stake.

### Key Concepts

- **Activation Threshold**: The minimum amount required to become an active validator
- **Staking Period**: Tokens must remain staked for a minimum period before withdrawal
- **Rewards**: Earned based on your stake proportion and network activity
- **Slashing Risk**: Validators who misbehave may have a portion of their stake slashed

## Staking Options

### Option 1: Run Your Own Validator

If you have the technical expertise and infrastructure, you can run your own sequencer node and stake directly.

**Requirements:**
- Meet the minimum stake threshold
- Run and maintain sequencer infrastructure
- Ensure high availability and proper operation

See the [Sequencer Setup Guide](/operate/operators/setup/sequencer_management) for details.

### Option 2: Delegate to an Operator

If you don't want to run infrastructure, you can delegate your stake to a professional operator.

See [Delegating Stake](/participate/token/delegation) for details.

## Understanding Slashing Risk

Before staking, understand that your stake can be partially slashed if:
- The validator you stake with (or delegate to) commits protocol violations
- The validator is inactive for extended periods
- The validator proposes or attests to invalid blocks

Slashing is managed through governance voting based on evidence collected both onchain and offchain.

## Unstaking

When you want to withdraw your staked tokens, you must go through an unstaking process with mandatory delays.

### Exit Delays

| Delay Type | Alpha (Mainnet) | Testnet |
|-----------|-----------------|---------|
| **Staking Exit Delay** | 4 days | 2 days |
| **Governance Withdrawal Delay** | ~38 days | ~1.6 days |

The **staking exit delay** is the minimum time after initiating withdrawal before you can claim your tokens. It allows time for pending slashing conditions to be detected.

If your tokens are deposited in the Governance Staking Escrow (GSE) for voting, the **governance withdrawal delay** also applies. This delay is calculated as `votingDelay/5 + votingDuration + executionDelay` to ensure voted-on proposals can be executed before voters exit. On mainnet this is approximately 38 days (0.6 + 7 + 30 days).

### How to Unstake

To unstake your tokens, use the [Aztec Staking Dashboard](https://stake.aztec.network/). The dashboard guides you through the unstaking process:

1. **Initiate withdrawal**: Select your validator and begin the exit process
2. **Wait for the exit delay**: Your tokens remain locked during this period (if your tokens are also in the Governance Staking Escrow, the longer governance withdrawal delay applies)
3. **Finalize withdrawal**: After the delay, complete the withdrawal to receive your tokens

If you've delegated stake, contact your operator or use the delegation interface to request unstaking.

### Important Considerations

- **Slashing Risk**: You can still be slashed during the exit delay if misbehavior is detected from when you were active
- **No Rewards During Exit**: You do not earn staking rewards during the exit delay period

## Next Steps

- [Delegate your stake](/participate/token/delegation) if you prefer not to run infrastructure
- [Learn about voting](/participate/token/voting) to participate in governance with your staked tokens
- [Understand governance](/participate/governance) to know how protocol decisions are made
