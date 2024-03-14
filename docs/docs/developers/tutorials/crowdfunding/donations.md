---
title: Build a donations contract
tags: [developers, tutorial, example]
---

In this tutorial we'll create two contracts related to crowdfunding:

- A crowdfunding contract with two core components
  - Fully private donations
  - Verifiable withdrawals to the operator
- A reward contract for anyone else to anonymously reward donors

## Setup

### Install tools

Please ensure that the you already have [Installed the Sandbox](https://docs.aztec.network/developers/getting_started/quickstart#install-the-sandbox).

And if using VSCode, [Install Noir LSP](https://docs.aztec.network/developers/contracts/main#install-noir-lsp-recommended).

### Create an Aztec project

Create a new Aztec contract project named "crowdfunding":

```sh
aztec-nargo new --contract crowdfunding
```

Inside the new `crowdfunding` directory you will have a base to implement the Aztec smart contract.

## Private donations

1. An "Operator" begins a Crowdfunding campaign (contract), specifying:

- an existing token address
- their account address
- a deadline timestamp

2. Any address can donate (in private context)

- private transfer token from sender to contract
- privately note amount donated (claimable via other contract)

3. Only the operator can withdraw from fund

### 1. Create a campaign

Contract.
#include_code empty-contract /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr rust

Constructor.
#include_code constructor /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr rust

Storage.
#include_code storage /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr rust

Ctrl+click types, ( requires LSP)

### 2.

## Implement Rewards

Continue building a complementary rewards contract [here](./rewards.md).
