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

### Sponsored Transactions
Some applications pay fees on behalf of their users, enabling "free" transactions. The application covers the cost, not you.

### Fee-Paying Contracts
Specialized contracts can accept other tokens and pay fees in $AZTEC for you. This is useful if you only hold other tokens.

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
