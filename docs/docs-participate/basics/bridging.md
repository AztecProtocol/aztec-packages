---
title: Bridging
description: Understand how assets move between Ethereum (L1) and Aztec (L2) through portals and message passing.
displayed_sidebar: participateSidebar
---

# Bridging Between Ethereum and Aztec

Aztec is a Layer 2 rollup on Ethereum. This means assets like tokens need to be "bridged" between the two networks. This page explains how bridging works at a high level.

## How Bridging Works

Moving assets between Ethereum (L1) and Aztec (L2) involves a few key concepts:

### Portal Contracts

A **portal** is a smart contract on Ethereum that represents the L1 side of a bridge. Each bridged asset has a portal contract that:

- Holds locked assets on L1
- Sends messages to L2 when deposits are made
- Releases assets when withdrawals are processed

### Message Passing

Unlike direct function calls, L1 and L2 communicate through **messages**. This asynchronous design is necessary because:

- L2 transactions are private and can't be triggered directly from L1
- Privacy requires that L2 "pulls" messages rather than having L1 "push" them
- The rollup batches operations for efficiency

### The Bridging Flow

**Depositing to Aztec (L1 → L2):**

1. You send tokens to the portal contract on Ethereum
2. The portal creates a message for Aztec
3. The message is included in the next rollup
4. You (or anyone) can claim the tokens on Aztec

**Withdrawing from Aztec (L2 → L1):**

1. You initiate a withdrawal on Aztec
2. A message is created for the portal
3. After the epoch is proven and verified on L1
4. You can claim your tokens from the portal contract

## Why "Pull" Instead of "Push"?

Other rollups often have L1 contracts directly call L2 functions (push model). Aztec uses a pull model where L2 retrieves messages from L1. Here's why:

**Privacy**: If L1 pushed data to L2, all the call data would be visible on Ethereum. With the pull model:
- The deposit amount and original sender are visible on L1
- The recipient on L2 can remain private
- L2 reveals only what's necessary

## Timing Considerations

### Deposits (L1 → L2)

- The L1 transaction sends tokens to the portal and creates a message
- The message becomes available on L2 once the L1 block is processed by the rollup
- The recipient can then claim the tokens on L2

### Withdrawals (L2 → L1)

Withdrawals take longer:
- Must wait for the epoch to end
- Must wait for the proof to be generated
- Must wait for proof verification on Ethereum
- Only then can tokens be claimed on L1

This delay is inherent to ZK rollups since the proof must be generated and verified before L1 state can be updated.

## What Can Be Bridged

Aztec uses a portal contract pattern where each L2 token contract is paired with a portal contract on L1. Any token can be bridged if a corresponding portal contract is deployed. There is no fixed list of "supported" tokens - developers can create portals for any L1 asset.

The network's fee asset has its own dedicated portal: the **Fee Juice Portal**. It converts $AZTEC on Ethereum into [Fee Juice](/participate/basics/fees) on Aztec. Unlike regular token portals, this one is one-way for users: Fee Juice cannot be transferred or withdrawn, only spent on transaction fees.

## Security Considerations

Bridging involves trust assumptions:

- **Smart contract security** - Portal contracts must be correct and secure
- **Rollup validity** - The Aztec proof system must be sound
- **Liveness** - The network must continue operating for withdrawals

Aztec's ZK proofs provide strong guarantees - if a proof verifies on L1, the state transition was valid. There is no challenge period; finality on L1 is immediate once the proof is verified.

## Using Bridges

You usually will not interact with portal contracts directly. You have a few options for moving assets to Aztec:

- **Bridge apps** - [Shield](https://shield.human.tech/) is a bridge for moving assets into Aztec, including converting $AZTEC into [Fee Juice](/participate/basics/fees) to pay transaction fees, with bridge-plus-swap functionality rolling out as well. To connect to a bridge app you need an Aztec [wallet](/participate/basics/wallets) such as [Azguard](https://azguardwallet.io/). Find the current list of bridges in the Bridges category of the [Aztec ecosystem page](https://aztec.network/projects).
- **Wallet and app flows** - Some Aztec wallets and apps include bridging or funding flows directly, so check your wallet before reaching for a separate bridge.
- **Direct contract interaction** - Advanced users can interact with portal contracts directly. Official contract addresses are listed on the [networks page](/networks).

:::caution Verify before you bridge
Fake bridge sites are a common scam. Open bridge apps from the [ecosystem page](https://aztec.network/projects) rather than from search results or links sent to you in chat, and read [Staying safe](/participate/safety) before your first deposit.
:::

New to Aztec? The [Get started guide](/participate/get-started) walks through funding your account step by step.

---

:::tip For developers
Learn how to implement bridging in your applications in the [Portal documentation](/developers/docs/aztec-nr/framework-description/ethereum_aztec_messaging).
:::
