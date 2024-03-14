---
title: Build a rewards contract
tags: [developers, tutorial, example]
---

In this section we'll build a reward contract for anyone to anonymously reward donors to a campaign. Build the donations contract [here](./donations.md).

## Setup

### Install tools

Please ensure that the you already have [Installed the Sandbox](https://docs.aztec.network/developers/getting_started/quickstart#install-the-sandbox).

And if using VSCode, [Install Noir LSP](https://docs.aztec.network/developers/contracts/main#install-noir-lsp-recommended).

### Create an Aztec project

Create a new Aztec contract project named "claims":

```sh
aztec-nargo new --contract claims
```

Inside the new `claims` directory you will have a base to implement the Aztec smart contract.

## Rewarding donors

1. Anyone can reward donors via a Claim contract
2. Rewarder creates a Claim contract, specifying:

- the target fund address
- the reward token address

3. Donors of the target fund can call claim with a Note

### 1. Create a reward contract

### 2.

# Privacy
