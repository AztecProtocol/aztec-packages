---
title: Getting Started on Local Network
description: Guide for developers to get started with the Aztec local network, including account creation and contract deployment.
sidebar_position: 0
tags: [local_network, testnet]
---

Get started on your local environment using a local network. If you'd rather jump into devnet, read the [getting started on devnet guide](./getting_started_on_devnet.md).

The local network is a local development Aztec network running fully on your machine, and interacting with a development Ethereum node. You can develop and deploy on it just like on a testnet or mainnet (when the time comes). The local network makes it faster and easier to develop and test your Aztec applications.

What's included in the local network:

- Local Ethereum network (Anvil)
- Deployed Aztec protocol contracts (for L1 and L2)
- A set of test accounts with some test tokens to pay fees
- Development tools to compile contracts and interact with the network (`aztec` and `aztec-wallet`)

This guide will teach you how to install the Aztec local network, run it using the Aztec CLI, and interact with contracts using the wallet CLI.

## Prerequisites

import { General, Fees } from '@site/src/components/Snippets/general_snippets';

- <General.node_ver />

## Install and run the local network

### Install the Aztec toolchain

Run:

```bash
VERSION=#include_version_without_prefix bash -i <(curl -sL https://install.aztec.network/#include_version_without_prefix)
```

This will install the following tools:

- **aztec** - compiles and tests aztec contracts and launches various infrastructure subsystems (full local network, sequencer, prover, pxe, etc) and provides utility commands to interact with the network
- **aztec-up** - a version manager for the Aztec toolchain. Use `aztec-up install <version>` to install a new version, `aztec-up use <version>` to switch between installed versions, or `aztec-up list` to see installed versions
- **aztec-wallet** - a tool for interacting with the aztec network

### Start the local network

Once these have been installed, to start the local network, run:

```bash
aztec start --local-network
```

**Congratulations, you have just installed and run the Aztec local network.**

```bash
     /\        | |
    /  \    ___| |_ ___  ___
   / /\ \  |_  / __/ _ \/ __|
  / ____ \  / /| ||  __/ (__
 /_/___ \_\/___|\__\___|\___|

```

In the terminal, you will see some logs:

1. Local network version
2. Contract addresses of rollup contracts
3. PXE (private execution environment) setup logs
4. Initial accounts that are shipped with the local network and can be used in tests

You'll know the local network is ready to go when you see something like this:

```bash
[INFO] Aztec Server listening on port 8080
```

## Using the local network test accounts

import { CLI_Add_Test_Accounts } from '@site/src/components/Snippets/general_snippets';

<CLI_Add_Test_Accounts />

To add the test accounts in the wallet, run this in another terminal:

```bash
aztec-wallet import-test-accounts
```

We'll use the first test account, `test0`, throughout to pay for transactions.

## Creating an account in the local network

```bash
aztec-wallet create-account -a my-wallet -f test0
```

:::info
`aztec-wallet` will generate transaction proofs by default. This is not required when sending transactions on the local network, but it is required when sending transactions on the devnet or mainnet.

You can turn off proof generation by adding the `--prover none` flag to the command or setting `PXE_PROVER=none`.
:::

Here `-a my-wallet` gives the account an alias, and `-f test0` specifies which account pays the deployment fee (in this case, the pre funded test account).

This will create a new account and register it with the alias `my-wallet`. You can reference it later with `accounts:my-wallet`. You will see logs showing the address, public key, secret key, and more.

On successful deployment of the account, you should see something like this:

```bash
New account:

Address:         0x1c87e7e741d2973f42506200b8bfa6da0acdac315077ac0f94ff438ca6d663fe
Public key:      0x1e2662f00e236c170ea64d185207e10e48faef6c439d67f884eedcba3fd68212...
Secret key:     0x028fbc1af347da4da75b815a93d48988c99e19063122e61c025db39b48fb9190
Partial address: 0x1f32ba4e97f718885ba882b1adf17346200ac1d353c452dad6c80395d288246b
Salt:            0x0000000000000000000000000000000000000000000000000000000000000000
Init hash:       0x18139514e46afbaf9aa93ee43baeab74f7128328b748ac0ec8ed9d13f582286c

Waiting for account contract deployment...
Deploy tx hash:  0x1f4c0d41411ce0fcd8a8e48d7d46f16cadfab34c42ca3abc9118307c2d67c1a0
Deploy tx fee:   8748339200000
Account stored in database with aliases last & my-wallet
```

You may need to scroll up as there are some other logs printed after it.

You can double check by running `aztec-wallet get-alias accounts:my-wallet`.

For simplicity we'll keep using the test account. Next, let's deploy our own test token.

## Deploying a contract

The local network comes with some pre-compiled contract artifacts that you can deploy and play with. One of these is an example token contract.

Deploy it with this:

```bash
aztec-wallet deploy TokenContractArtifact --from accounts:test0 --args accounts:test0 TestToken TST 18 -a testtoken
```

This takes

- the contract artifact as the argument, which is `TokenContractArtifact`
- the deployer account, which we used `test0`
- the args that the contract constructor takes, which is the `admin` (`accounts:test0`), `name` (`TestToken`), `symbol` (`TST`), and `decimals` (`18`)
- an alias `testtoken` (`-a`) so we can easily reference it later with `contracts:testtoken`

On successful deployment, you should see something like this:

```bash
Contract deployed at 0x1d833888c43bc70350d83852cef3320a9c5768f0f7fb25ef7a989932fbb2f490
Contract partial address 0x19d1d74695b01d93257c1190a55810f5c09971c245e58f524584fada11e09ca4
Contract init hash 0x1b312a8ca1c18785da7a5ff087d13e1ce0d2370bb79789e83fa4bc226f9c8bb9
Deployment tx hash: 0x27e8168c81472bf76e3b37a056c4dd0d303376a1ab57997287d6bb5c6813ac6f
Deployment salt: 0x19a2aa2f97a9af569cfb793b54eedc0db9adacff5fb823e24ca68c6c70d98960
Deployer: 0x089323ce9a610e9f013b661ce80dde444b554e9f6ed9f5167adb234668f0af72
Transaction fee: 12617052998800000
Contract stored in database with aliases last & testtoken
```

In the next step, let's mint some tokens.

## Minting public tokens

Call the public mint function like this:

```bash
aztec-wallet send mint_to_public --from accounts:test0 --contract-address contracts:testtoken --args accounts:test0 100
```

This takes

- the function name as the argument, which is `mint_to_public`
- the `from` account (caller) which is `accounts:test0`
- the contract address, which is aliased as `contracts:testtoken` (or simply `testtoken`)
- the args that the function takes, which is the account to mint the tokens into (`test0`), and `amount` (`100`)

This only works because we are using the secret key of the admin who has permissions to mint.

A successful call should print something like this:

```bash
Estimated gas usage:    da=317,l2=185546,teardownDA=0,teardownL2=0
Maximum total tx fee:   1882716707400000

Transaction hash: 0x11337b25743bc3e9c57c93ace9d0b7c6a0c45e1de0b9f7b92b51788f1d1edd3e
Transaction has been mined
 Tx fee: 1141039198800000
 Status: checkpointed
 Block number: 7
 Block hash: 0x2b39376ee9801855fc6fd01b09b1fe67ca83ab355fd86e765d45e23907edc1be
```

You can double check by calling the function that checks your public account balance. Unlike `send` which submits a transaction to the network, `simulate` runs a function locally and returns the result without modifying any state:

```bash
aztec-wallet simulate balance_of_public --from test0 --contract-address testtoken --args accounts:test0
```

This should print

```bash
Simulation result:  100n
```

## Playing with hybrid state and private functions

In the following steps, we'll move some tokens from public to private state. As covered in the [overview](./overview.md), public state works like a ledger (similar to Ethereum), while private state is stored as encrypted notes that only the owner can access. The `transfer_to_private` function reduces your public balance and creates private notes in its place.

```bash
aztec-wallet send transfer_to_private --from accounts:test0 --contract-address testtoken --args accounts:test0 25
```

The arguments for `transfer_to_private` function are:

- the account address to transfer to
- the amount of tokens to send to private

A successful call should print something similar to what you've seen before.

Now when you call `balance_of_public` again you will see 75.

```bash
aztec-wallet simulate balance_of_public --from test0 --contract-address testtoken --args accounts:test0
```

This should print

```bash
Simulation result:  75n
```

And then call `balance_of_private` to check that you have your tokens. Notice that `--from` is required when querying private state because private balances are stored as encrypted notes, and the PXE needs the account's keys to decrypt and find them.

```bash
aztec-wallet simulate balance_of_private --from test0 --contract-address testtoken --args accounts:test0
```

This should print

```bash
Simulation result:  25n
```

**Congratulations, you now know the fundamentals of working with the Aztec local network.** You are ready to move onto the more fun stuff.

## What's next?

Want to build something cool on Aztec?

- Check out the [Token Contract Tutorial](./docs/tutorials/contract_tutorials/token_contract.md) for a beginner tutorial, or jump into more advanced ones
- Start on your own thing and check out the How To Guides to help you
