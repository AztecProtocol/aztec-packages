---
title: Fees
description: Understand how transaction fees work on Aztec, including mana and the fee token.
displayed_sidebar: participateSidebar
---

# Fees on Aztec

Every transaction on Aztec requires paying a fee. This page explains how fees work and how to get the tokens needed to pay them.

## Mana: Aztec's Unit of Work

On Ethereum, you pay for computation using "gas." On Aztec, we use "mana." Mana measures the computational effort required to process your transaction.

| Ethereum | Aztec | Description |
|----------|-------|-------------|
| Gas | Mana | Unit of computational work |
| ETH per gas | $AZTEC per mana | Price per unit |
| Gas fee (in ETH) | Fee (in $AZTEC) | Total cost |

## What Fees Cover

Aztec is a Layer 2 rollup on Ethereum, so fees account for costs on both layers:

1. **L1 costs** - Publishing blocks and data to Ethereum
2. **L2 costs** - Operating the Aztec network, including proving

## Paying Fees

### The Fee Token

Fees on Aztec are paid in $AZTEC, the native token of the network. To pay fees, you need:

1. $AZTEC tokens bridged from Ethereum
2. An Aztec account to hold them

### Getting Fee Tokens

**On Testnet:**
- Visit the [Aztec testnet faucet](https://testnet.aztec.network/) to get free testnet tokens
- You'll also need Sepolia ETH for bridging - get it from [Sepolia faucets](https://sepoliafaucet.com/)

**On Mainnet:**
- Bridge $AZTEC from Ethereum to Aztec
- The bridging process is similar to other L2 token bridges

### How Bridging Works

The fee token is bridged from Ethereum:

1. Lock $AZTEC on Ethereum (L1)
2. Claim your tokens on Aztec (L2)
3. Use them to pay transaction fees

You can even claim bridged tokens and use them to pay for the claim transaction itself.

## Fee Payment Options

Aztec offers flexible fee payment:

### Pay Directly
If you have $AZTEC, pay for your own transactions directly from your account.

### Fee-Paying Contracts

A fee-paying contract (FPC) pays $AZTEC (referred to as "Fee Juice" in the developer docs) on your behalf, typically in exchange for another token. This lets applications accept fees in tokens their users already hold and lets brand-new accounts transact without first acquiring $AZTEC.

- **Sponsored FPC** — available on testnet, devnet, and local network, covers transaction costs for free. Useful for development and onboarding.
- **Third-party FPCs** — deployed by ecosystem teams for use on testnet and mainnet. These accept various tokens and handle $AZTEC fee payment behind the scenes. As one example, Nethermind offers a [Private Multi Asset FPC](https://github.com/NethermindEth/aztec-fpc) that supports multiple tokens with private fee transfers.

### Private Fee Payment
Some apps pay fees through a fully private fee-paying contract, so the fee payment itself leaks no information about who you are. The more apps that route private fee payments through the *same* contract address, the stronger your privacy — every payment shares one large anonymity set instead of many small ones.

If you care about fee privacy, look for apps that use a shared private FPC. For example, [DeFi Wonderland](https://github.com/defi-wonderland/aztec-fee-payment) has built a community implementation where every app can derive the same contract address from a common deployment salt. Note that the derived address depends on the compiled contract bytecode, which changes between Aztec versions — always verify the address matches the network you are using.

## Understanding Your Fee

Transaction fees have several components:

- **Base fee** - Minimum cost that adjusts based on network demand
- **Priority fee** - Optional tip to prioritize your transaction
- **Congestion pricing** - Fees increase when the network is busy (similar to Ethereum's EIP-1559)

## Tips for Lower Fees

- **Time your transactions** - Fees may be lower during off-peak times
- **Batch operations** - Combine multiple actions in one transaction when possible
- **Check fee estimates** - Wallets show estimated fees before you confirm

---

:::tip For developers
Learn how to implement fee payment in your applications in the [Fees documentation](/developers/docs/foundational-topics/fees).
:::
