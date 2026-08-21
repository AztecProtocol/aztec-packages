---
title: Overview
description: Learn about the $AZTEC token - its utility, economics, and how to participate in the network.
displayed_sidebar: participateSidebar
references: ["l1-contracts/src/governance/CoinIssuer.sol", "l1-contracts/src/governance/RewardDistributor.sol"]
---

# $AZTEC Token Overview

The $AZTEC token is the native token of the Aztec network. It serves multiple essential functions that keep the network secure and operational.

## Token Specifications

| Property | Value |
|----------|-------|
| **Token Name** | Aztec |
| **Ticker** | AZTEC |
| **Standard** | ERC-20 (Ethereum) |
| **Contract Address** | `0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2` |
| **Decimals** | 18 |
| **Total Supply** | 10,350,000,000 AZTEC |

:::note
Please verify the contract address and other specifications with official Aztec sources before interacting with the token.
:::

## Token Utility

The $AZTEC token has three primary uses:

### 1. Transaction Fees
All transactions on Aztec require fees. Fees are paid in [Fee Juice](/participate/basics/fees), a non-transferable fee asset created by bridging $AZTEC from Ethereum into Aztec. This covers:
- Sending private transactions
- Interacting with smart contracts
- Deploying new contracts

### 2. Staking
Sequencers and validators must stake $AZTEC to participate in block production:
- Provides economic security for the network
- Creates incentives for honest behavior
- Enables slashing for malicious actions

### 3. Governance
$AZTEC holders can participate in protocol governance:
- Vote on protocol upgrades
- Influence network parameters
- Shape the future of Aztec

## Tokenomics

### Supply

The $AZTEC token has a fixed initial supply with a controlled inflation mechanism to fund network rewards.

### Inflation Rate

The protocol has a nominal annual inflation rate defined in the CoinIssuer contract. This rate:
- Funds rewards for sequencers and provers
- Is capped and cannot be changed after deployment
- Represents the maximum possible inflation (actual may be lower)

### Token Distribution

Checkpoint rewards are distributed each slot:
- **70%** to block proposers (sequencers)
- **30%** to provers

See [Economics & Rewards](/participate/token/economics) for detailed information on how rewards work.

## How to Participate

As a token holder, you have several options:

| Action | What It Does | Requirements |
|--------|--------------|--------------|
| **[Stake](/participate/token/staking)** | Secure the network, earn rewards | Meet minimum stake threshold |
| **[Delegate](/participate/token/delegation)** | Earn rewards without running infrastructure | Choose an operator to delegate to |
| **[Vote](/participate/token/voting)** | Participate in governance | Hold staked or governance-locked tokens |

#if(testnet)
## Getting Testnet Tokens

To participate in the Aztec testnet, you'll need testnet tokens. Visit the **[Aztec Testnet Faucet](https://testnet.aztec.network/)** to get started.

The faucet provides:
- Testnet TST tokens for staking and governance participation
- Instructions for connecting your wallet

You'll also need Sepolia ETH for L1 transaction fees:
- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Alchemy Sepolia Faucet](https://www.alchemy.com/faucets/ethereum-sepolia)
- [Infura Sepolia Faucet](https://www.infura.io/faucet/sepolia)
#endif

## Understanding the Risks

Before staking or participating, understand:

- **Slashing** - Validators can lose stake for misbehavior
- **Lock-up periods** - Unstaking requires waiting through exit delays
- **Market risk** - Token value can fluctuate

See [Staking](/participate/token/staking) for details on staking requirements and risks.

---

:::tip Want to run infrastructure?
If you're interested in operating a node, sequencer, or prover, see the [Operator Guides](/operate/operators).
:::
