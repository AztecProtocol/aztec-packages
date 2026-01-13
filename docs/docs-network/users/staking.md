---
title: Staking Tokens
description: Learn how to stake tokens on the Aztec network to participate in network security and earn rewards.
displayed_sidebar: usersSidebar
---

# Staking Tokens

Staking allows you to participate in securing the Aztec network while earning rewards. This guide explains how staking works and how to get started.

## Before You Stake

Understanding these concepts will help you make informed decisions:

- [How proof of stake works](../concepts/proof-of-stake/)
- [Staking mechanism details](../concepts/proof-of-stake/#staking)
- [Slashing conditions](../concepts/proof-of-stake/#slashing) - understand the risks
- [Reward distribution](../concepts/proof-of-stake/#rewards)

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

See the [Sequencer Setup Guide](../operators/setup/sequencer_management) for details.

### Option 2: Delegate to an Operator

If you don't want to run infrastructure, you can delegate your stake to a professional operator.

See [Delegating Stake](./delegation) for details.

## Understanding Slashing Risk

Before staking, understand that your stake can be partially slashed if:
- The validator you stake with (or delegate to) commits protocol violations
- The validator is inactive for extended periods
- The validator proposes or attests to invalid blocks

See [Slashing Concepts](../concepts/proof-of-stake/#slashing) for detailed information.

## Next Steps

- [Delegate your stake](./delegation) if you prefer not to run infrastructure
- [Learn about voting](./voting) to participate in governance with your staked tokens
- [Understand governance](../concepts/governance/) to know how protocol decisions are made
