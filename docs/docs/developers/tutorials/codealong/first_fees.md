---
title: All about fees
sidebar_position: 0
tags: [fees, accounts, transactions, cli, contracts]
---

The Aztec network is a privacy preserving layer 2 secured by Ethereum, and for the consensus mechanism to work, Aztec makes use of an asset to pay for transactions called, "Fee juice".

By the end of this tutorial you will...
- Connect to the Aztec sandbox and/or testnet
- Use different payment methods to deploy accounts and make transactions via:
	- various `aztec-wallet` CLI commands
	- the Aztec.js library
- Understand the pros/cons of different payment methods


## Background

As a quick summary of required knowledge:

(**TODO: Each of these as snippets**)

**The PXE**
The PXE is a client-side key manager, private contract storage, and Private eXecution Environment for private transactions. It interfaces with the Aztec network, and can be used via its json RPC client. A PXE is a core part of an Aztec wallet and Sandbox, but can be decoupled and run independently.

**An Aztec node**
An Aztec node is a prover/sequencer that is part of a decentralised Aztec network. The Aztec testnet rolls up to Ethereum Sepolia.

**The Aztec Sandbox**
The Aztec Sandbox runs a local environment for rapid development, it includes: an Ethereum node, an Aztec node, and PXE.

## Connect to the network

We'll go through both the `aztec-wallet` cli wallet and the `aztec.js` library, to a local Aztec network (in the sandbox) and the Aztec testnet.

### Tools

**TODO: as snippet**
To install the required tools see [Getting Started](../../getting_started) or just run `bash -i <(curl -s https://install.aztec.network)`

Test the cli wallet with: `aztec-wallet --version`

By default the sandbox runs everything including a pxe. For this tutorial, and more realistically when using testnet, we will be using PXEs client side in the cli wallet.

Start the sandbox (L1, L2, but not the PXE) via: `NO_PXE=true aztec start --sandbox`

### Specifying the network URL in commands

When using `aztec-wallet`, the Aztec network node to connect to can be specified:

```bash
aztec-wallet --node-url <string> ...
```

The string currently defaults to the the local sandbox: `http://host.docker.internal:8080`, or can be a bootnode url.
This can alternatively be specified via an environment variable: `AZTEC_NODE_URL`.

The equivalent in Aztec.js:

```javascript
???
```

## Create Account Contract in a PXE

**TODO: as snippet**

An account on Aztec is a smart contract that specifies a method of authentication and a method of payment, allowing it to be used by the protocol to perform a transaction.

For convenience, Aztec has implemented an account contract that authenticates transactions using Schnorr signatures. The contract class for a Schnorr account is pre-registered on the network to bootstrap first use. Ordinarily for a contract to be deployed, its class would have to be register with the network first.

When a PXE creates a Schnorr account, there are three key things that occur:
 - generation of keys privately
 - registeration of a Schnorr account locally (effectively an instance of the Schnorr account class)
   - at this stage the address of the account is known, even though it is not yet deployed
 - initialization and deployment of the account contract to the network

**Create the keys and account in the PXE**

Lets first create the account but only register the instance in the pxe. Its address will be calculated, and in a later step we can deploy it counterfactually to the network.

```bash
aztec-wallet create-account --register-only -a main
```

The `-a main` sets this new account's alias to, "main". Use `aztec-wallet get-alias` (with no params) to see all aliases.

The equivalent in Aztec.js:

```javascript

```

Your PXE now has keys for an account that can be deployed on Aztec network(s).

## Paying for an account deployment transaction

To make transactions on the network, your account contract will need to specify a payment method of the enshrined asset, "Fee Juice".

### Sponsored FPC

To bootstrap first use, a sponsored fee paying contract (the canonical sponsored FPC) can be used to deploy your first account.

**TODO: as snippet**
A fee paying contract (FPC) effectively implements fee abstraction. It is a contract that pays for transactions of other accounts, when its own custom criteria is met.
In the case of the canonical sponsored FPC, the only criteria is an upper bound on how much it sponsors an account's transactions. This will be enough to at least deploy an account.

The PXE can be queried for the canonical sponsored FPC address, and then specified as the payment method.

Via the CLI:

The alias set earlier can be confirmed using: `aztec-wallet get-alias accounts:main`, this is specified here in `-f main`.

```bash
SPONSORED_FPC_ADDRESS=`aztec-wallet --get-canonical-sponsored-fpc-address`
aztec-wallet deploy-account -f main --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS
```


info:::
This is the general form of payment via the sponsored fpc that can be used in multiple commands:
`--payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS`

:::

The equivalent in Aztec.js:

```javascript

```

**Congratulations! You have successfully created an account on Aztec!**

This contract now exists in the sandbox network, or on testnet if you specified a node url.

### Fee Juice

Apart from the FPC payment methods, the default method for paying for transactions is via fee juice direct from the sender of the tx.
For the special case of deploying an account, another funded account can be specified to pay for the deployment transaction.

#### Sandbox pre-funded test accounts

The sandbox starts with 3 test accounts, providing another way to bootstrap initial testing with accounts. To add these to the PXE...

For the CLI:
```bash
aztec-wallet import-test-accounts
```

Confirm with: `aztec-wallet get-alias`, to see all aliases

Alternatively with Aztec.js
```javascript
getInitialTestAccountsWallets(pxe: PXE): Promise<AccountWalletWithSecretKey[]>
```

Note: The test account addresses can be seen in the sandbox logs when it starts up.

**Create and deploy a new account, paid for by another account**

For the sandbox only, you can use the test accounts provided at aliases: `test0`, `test1`, `test2`

```bash
aztec-wallet create-account -a alice --payment method=fee_juice,feePayer=test0
```

note:::
Specifying the `feePayer` is unique to contract deployment (create/deploy commands).
`--payment method=fee_juice,feePayer=$FUNDED_ACCOUNT`
The fee_juice payment method (default for txs), spends the fee juice from the account sending the transaction.

:::

Alternatively with Aztec.js

```javascript

```

### Bridging Fee Juice

The sandbox allows free-minting on it's L1 to be bridged and claimed on Aztec. For testnet you will have to have an account on L1 which has the fee asset token.

We'll register a new account `accBFJ` and bridge fee-juice to it.

```bash
aztec-wallet create-account -a accBFJ --register-only
aztec-wallet bridge-fee-juice 1000000000000000000 accBFJ --mint --no-wait
```

You'll have to wait for two blocks to pass for bridged fee juice to be ready on Aztec. For the sandbox you do this by putting through two arbitrary transactions. Eg:
```bash
aztec-wallet deploy counter_contract@Counter --init initialize --args 0 accounts:test0 -f test0 -a counter
aztec-wallet send increment -ca counter --args accounts:test0 accounts:test0 -f test0
```

Now the funded account can deploy itself with the bridged fees, claiming the bridged fee juice and deploying the contract in one transaction:

```bash
aztec-wallet deploy-account -f accBFJ --payment method=fee_juice,claim
```

The equivalent using Aztec.js:

```javascript

```

### Fee Paying Contract payment (public/private)

Setting up your own FPC will be expanded upon later, for now we will just look at the syntax for understanding.

First register the FPC address in your pxe. In reality this might be an application funding users' transactions via their token.
The second line can be any transaction command that takes a --payment parameter. See `aztec-wallet --help` and the help of corresponding commands to check.

```bash
aztec-wallet register-contract $FPC_ADDRESS FPCContract -f main
aztec-wallet <your transaction> --payment method=fpc-public,fpc-contract=$FPC_ADDRESS
```

## Summary of fee payment options

The two key ways of paying for transactions: fee juice from an account or via an FPC. Both of which are contracts on the aztec network.

### Fee juice from an account (default)

- from the sender of a transaction (default)
  - most common if making transactions from a funded account
  - difficult to deploy without funds already
- specifying a different fee-payer account (new account creation/deployment only)
  - using a funded account to deploy another account, or rapid testing on the sandbox
  - need to already have a funded account
- claiming fee juice from already-bridged L1 and immediately using
  - great for bootstrapping an account on Aztec
  - need to already have aztec fee asset on an L1 account

### Fee juice from a fee paying contract

- via public/private payment
  - can use a private account, privately, without holding fees
  - can pay in other asset instead of fee juice
- sponsored payment
  - enables new users to bootstrap their first account

### Tabulated summary

`aztec-wallet` CLI params:

method\options|feePayer|asset|fpc|claim
-|-|-|-|-
fee_juice|create/deploy account only|NA|NA|if bridged
fpc-public|NA|asset address|contract address|NA
fpc-private|NA|asset address|contract address|NA
fpc-sponsored|NA|NA|NA|NA

## Deploying contracts and interacting with them

(Could move this to a part 2)

### Deploy the Token token
- Deploy a new account
- Deploy the Token contract
- Mint tokens

### Deploy an fpc contract
- Deploy the bananafpc contract, referring to previously deployed token
- bridge fee juice to it
- use the fpc to pay for some txs
