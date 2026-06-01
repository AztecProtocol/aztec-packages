---
title: Staking Tokens
description: Learn how to stake tokens on the Aztec network to participate in network security and earn rewards.
displayed_sidebar: participateSidebar
---

# Staking tokens

Staking allows you to participate in securing the Aztec network while earning rewards. This guide explains how staking works and how to get started.

## Before you stake

Understanding these concepts will help you make informed decisions:

- [Blocks and epochs](/participate/basics/blocks): how block production works
- [Economics and rewards](/participate/token/economics): how rewards are distributed

## Overview

When you stake tokens on the Aztec network, your tokens are locked in a smart contract and used to secure the network. In return, you earn a share of the network rewards proportional to your stake.

### Key concepts

- **Activation threshold**: the minimum amount required to become an active validator
- **Staking period**: tokens must remain staked for a minimum period before withdrawal
- **Rewards**: earned based on your stake proportion and network activity
- **Slashing risk**: validators who misbehave may have a portion of their stake slashed

## Staking options

### Option 1: run your own sequencer

If you have the technical expertise and infrastructure, you can run your own sequencer node and stake directly.

**Requirements:**
- Meet the minimum stake threshold
- Run and maintain sequencer infrastructure
- Ensure high availability and proper operation

See the [Sequencer setup guide](/operate/operators/setup/sequencer_management) for details.

### Option 2: delegate to an operator

If you don't want to run infrastructure, you can delegate your stake to a professional operator.

See [Delegating stake](/participate/token/delegation) for details.

## Understanding slashing risk

Before staking, understand that your stake can be partially slashed if:
- The validator you stake with (or delegate to) commits protocol violations
- The validator is inactive for extended periods
- The validator proposes or attests to invalid blocks

Slashing is managed through governance voting based on evidence collected both onchain and offchain. For the detection rules, current per-offense amounts, and the ejection threshold, see [Slashing and offenses](/operate/operators/sequencer-management/slashing_and_offenses).

## Unstaking

When you want to withdraw your staked tokens, you must go through an unstaking process with mandatory delays.

### Exit delays

When you initiate an unstake, two clocks start at the same time, and you can finalize only after both have elapsed:

| Delay | Alpha (mainnet) | Testnet |
|---|---|---|
| Staking exit delay (rollup-level, allows slashing detection) | 4 days | 2 days |
| Governance withdrawal delay (`votingDelay/5 + votingDuration + executionDelay`) | ~38 days | ~1.6 days |

Because the two clocks run concurrently from the moment you call `initiateWithdraw`, your effective wait is the **longer of the two**: roughly 38 days on mainnet and roughly 2 days on testnet. This applies whether you self-stake or delegate through a Token Vault. In the current rollup contracts, staking deposits route through the Governance Staking Escrow (GSE), and the governance withdrawal delay applies to every exit from that path.

:::note Upcoming change (AZIP-1)
[AZIP-1](https://github.com/AztecProtocol/governance/pull/4) will cut the execution delay from 30 days to 2 days. Once adopted, the mainnet governance withdrawal delay drops from ~38 days to ~10 days. The values on this page reflect the current live parameters and change only once AZIP-1 is executed.
:::

#### Why two delays?

The shorter rollup-level exit delay exists so the network can detect and slash a misbehaving validator during the exit window. The longer governance withdrawal delay exists so that anyone who *could have voted* on a proposal during their staked window remains subject to its outcome, even if they never actually voted. Your stake unconditionally backs voting power in the GSE, which is why the governance delay applies regardless of whether you cast a vote.

### How to unstake

To unstake your tokens, use the [Aztec staking dashboard](https://stake.aztec.network/). The dashboard guides you through the unstaking process:

1. **Initiate withdrawal**: select your validator and begin the exit process. The dashboard shows the exact unlock time for your position.
2. **Wait**: on mainnet, expect roughly 38 days from initiation to finalization; on testnet, roughly 2 days. Your tokens are locked during this period.
3. **Finalize withdrawal**: after the delay, complete the withdrawal to receive your tokens.

If you've delegated stake, use the same dashboard against your Token Vault to initiate and later finalize the withdrawal.

### Important considerations

- **Slashing risk during exit**: you can still be slashed during the exit window if misbehavior from when you were active is detected.
- **No rewards during exit**: you do not earn staking rewards during the exit period.

## Next steps

- [Delegate your stake](/participate/token/delegation) if you prefer not to run infrastructure
- [Learn about voting](/participate/token/voting) to participate in governance with your staked tokens
- [Understand governance](/participate/governance) to know how protocol decisions are made
