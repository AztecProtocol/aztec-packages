---
title: All about fees
sidebar_position: 0
tags: [fees, accounts, transactions, cli, contracts]
---

The Aztec network is a privacy preserving layer 2 secured by Ethereum, and for the consensus mechanism to work, Aztec makes use of an asset to pay for transactions called, "Fee juice".

By the end of this tutorial you will...
- Connect to the Aztec testnet (or a locally run sandbox)
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

We'll go through both the `aztec-wallet` cli tool and the `aztec.js` library, to a local Aztec network (in the sandbox) and the Aztec testnet.

### Tools

**TODO: as snippet**
To install the required tools see [Getting Started](../../getting_started.md) or just run `bash -i <(curl -s https://install.aztec.network)`

Test the CLI tool with: `aztec-wallet --version`

By default the sandbox runs everything including a pxe, but for this tutorial and more realistically when using testnet, we will be using PXEs in the wallet, not the sandbox.

Start the sandbox (L1, L2, but not the PXE) via: `aztec start --sandbox.noPXE`

### Specifying the network URL

When using the `aztec-wallet` CLI tool, the Aztec network node to connect to can be specified:

```bash
aztec-wallet --node-url <string>
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

The equivalent in Aztec.js:

```javascript

```

Your PXE now has keys for an account that can be deployed on Aztec network(s).

## Paying for an account deployment transaction

To make transactions on the network, your account contract will need to specify a payment method of the enshrined asset, "Fee Juice".

TODO: types of payment methods, one-liner each
- FPCs
  - Sponsored
  - Public / Private
- bridge and claim
- Fee juice

### Sponsored FPC

To bootstrap first use, a sponsored fee paying contract (the canonical sponsored FPC) can be used to deploy your first account.

**TODO: as snippet**
A fee paying contract (FPC) effectively implements fee abstraction. It is a contract that pays for transactions of other accounts, when its own custom criteria is met.
In the case of the canonical sponsored FPC, the only criteria is an upper bound on how much it sponsors an account's transactions. This will be enough to at least deploy an account.

The PXE can be queried for the canonical sponsored FPC address, and then specified as the payment method.

Via the CLI:

```bash
FPC_ADDRESS=`aztec-wallet --get-canonical-sponsored-fpc-address`
aztec-wallet deploy-account --payment method=fpc-sponsored,fpc=$FPC_ADDRESS
```

info:::
This is the general form of payment via the sponsored fpc that can be used in multiple commands:
`--payment method=fpc-sponsored,fpc=$FPC_ADDRESS`
:::

The equivalent in Aztec.js:
```javascript

```

Congratulations! You have successfully created an account on Aztec!

This contract now exists in the sandbox network, or on testnet if you specified a node url.

### Fee Juice

Apart from the FPC payment methods, the default method for paying for transactions will be via fee juice.
For the special case of deploying an account, another funded account can be specified to pay for the deployment transaction.

#### Sandbox pre-funded test accounts

The sandbox starts with 3 test accounts, and is another way bootstrap initial testing with accounts. To add these to the PXE...

For the CLI:
```bash
aztec-wallet import-test-accounts
```

Alternatively with Aztec.js
```javascript
getInitialTestAccountsWallets(pxe: PXE): Promise<AccountWalletWithSecretKey[]>
```

Note: The test account addresses can be seen in the sandbox logs when it starts up.

**Create and deploy a new account, paid for via a test account (Sandbox only)**

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



```bash
aztec-wallet create-account -a main --register-only
aztec-wallet bridge-fee-juice 1000000000000000000 main --mint --no-wait
```

(wait for two blocks)

```bash
aztec-wallet deploy-account -f main --payment method=fee_juice,claim
```


### FPC private/public

...


## Deploying contracts and interacting with them

- recap payment methods
