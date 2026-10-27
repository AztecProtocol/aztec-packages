---
title: Getting Started on Local Network
description: Guide for developers to get started with the Aztec local network, including account creation and contract deployment.
sidebar_position: 0
tags: [local_network, testnet]
references: ["labs/aztec-up/*", "labs/yarn-project/aztec/src/cli/*", "labs/yarn-project/cli-wallet/src/*", "labs/noir-projects/noir-contracts/contracts/app/token_contract/*"]
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

Get started on your local environment using a local network. If you'd rather deploy to a live network, read the [getting started on testnet guide](./getting_started_on_testnet.md).

The local network is a local development Aztec network running fully on your machine, and interacting with a development Ethereum node. You can develop and deploy on it just like on a testnet or mainnet (when the time comes). The local network makes it faster and easier to develop and test your Aztec applications.

The local network always owns the local chain it starts. It deploys its own Aztec protocol contracts to the local Ethereum node and is not a mode for connecting to an existing Aztec network.

What's included in the local network:

- Local Ethereum network (Anvil)
- Deployed Aztec protocol contracts (for L1 and L2)
- A set of test accounts with some test tokens to pay fees
- On-demand block production via the automine sequencer
- Development tools to compile contracts and interact with the network (`aztec` and `aztec-wallet`)

This guide will teach you how to install the Aztec local network, run it using the Aztec CLI, and interact with contracts using the wallet CLI. To jump right into the testnet instead, click the `Testnet` tab.

import YouTubeEmbed from '@site/src/components/YouTubeEmbed';

To see the whole flow before you start, watch this one-minute walkthrough (find more on the [video lessons](./docs/resources/video_lessons.mdx) page):

<YouTubeEmbed videoId="_jgHNdNgFOg" title="Get Started on Aztec in Under 60 Seconds" />

## Prerequisites

import { General, Fees } from '@site/src/components/Snippets/general_snippets';

- <General.node_ver />

### macOS-specific requirements

- **Homebrew**: [Homebrew](https://brew.sh/) is required for installing dependencies on macOS.
- **Bash**: macOS ships with an outdated version of Bash (v3.2) that is known to cause issues with the Aztec installer. Install a modern version with `brew install bash`. Even if you use zsh as your default shell, the installer explicitly invokes `bash`. If the installer still picks up the old version, add the Homebrew `bash` to your `$PATH` or [set it as your default shell](https://support.apple.com/en-gb/guide/terminal/trml113/mac).

## Install and run the local network

### Install the Aztec toolchain

Run:

```bash
VERSION=6.0.0 bash -i <(curl -sL https://install.aztec.network)
```

This will install the following tools and add them to your `PATH`:

- **aztec** - compiles and tests Aztec contracts and launches various infrastructure subsystems (full local network, sequencer, prover, PXE, etc.) and provides utility commands to interact with the network
- **aztec-up** - a version manager for the Aztec toolchain. Use `aztec-up install <version>` to install a new version, `aztec-up use <version>` to switch between installed versions, or `aztec-up list` to see installed versions.
- **aztec-wallet** - a tool for interacting with the Aztec network
- **aztec-bb** - the Barretenberg proving backend
- **aztec-nargo** - the Noir compiler and simulator
- **aztec-forge**, **aztec-cast**, **aztec-anvil**, **aztec-chisel** - the bundled Foundry tools

Foundry, Noir, and Barretenberg are bundled at the versions `aztec` needs. Your own `forge` / `nargo` / `bb` installs still work under their bare names.

For syntax highlighting and LSP support while editing contracts, see the [Noir VSCode Extension guide](./docs/aztec-nr/installation.md).

### Start the local network

Once these have been installed, to start the local network, run:

```bash
aztec start --local-network
```

**Congratulations, you have just installed and run the Aztec local network!**

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

This will create a new wallet with an account and give it the alias `my-wallet`. Accounts can be referenced with `accounts:<alias>`. You will see logs telling you the address, public key, secret key, and more.

On successful deployment of the account, you should see something like this:

```bash
New account:

Address:         0x1653045495c127a6033ed7b2e19ed1e13598a027b66eed8eaad3d8d913ed01a0
Public key:      0x26bc01e8531f455fdaf8e292a84d569a1d2a0b8c7e6a29c968cb9485a27bcff31378289311d6a6e6659c7a21eaff4684a4d6c45a797bd9edde3ef720d821485426f5bef32d4efd025505f944d39c2ea5ef386b4bf1037d53c626e1cbb418d20e2d33546468da0350fde817c09b1f31ccfcf82c7a64d5b120fe1bd7e0e41cd8c62342e51cc7aa750db8982540e4c35fba85fb171357e82d7703de16be0ffde54e24f2f2e494d8249c9c06e5e50ccc9885070dee5cf0d5a1b9d847c47dfb581db4141ed3b7388694ca40c71008b9461d43453a8f193d9f02e5e3fccf4f2d556fe0
Signing key:     0x164c5ef7bfa426c2be1cd5b44dea22c214e9bbd2e4b0e9aa9f7e938f607df9bb
Secret key:     0x11dcaef4b44e4ccbdb151bb8d6a2ac3685c2ac1a99c9b9ff671773de7319e5b0
Partial address: 0x18395659bf180a60e6a4784a48598709a41e4305a257074f2edadd66bcd6afa3
Salt:            0x0000000000000000000000000000000000000000000000000000000000000000
Init hash:       0x0ba38faf3fc4b22432ea4eceedaef55d096373130182cea8fe0d810c5f4ec121
Using Fee Juice for fee payment with the balance of account 0x1653045495c127a6033ed7b2e19ed1e13598a027b66eed8eaad3d8d913ed01a0
Waiting for account contract deployment...
 Local processing time: 1.8s
 Node inclusion time: 3.0s
Deploy tx hash:  0x154f0e6c3b42551aa8fdca86c2b1ea850c51b27cce48eedcd52f7e777cdf0f75
Deploy tx fee:   590481708570000000
Account stored in database with aliases last & my-wallet
```

You may need to scroll up as there are some other logs printed after it.

You can double check by running `aztec-wallet get-alias accounts:my-wallet`.

For simplicity we'll keep using the test account, let's deploy our own test token!

## Deploying a contract

The local network comes with some contracts that you can deploy and play with. One of these is an example token contract.

Deploy it with this:

```bash
aztec-wallet deploy TokenContractArtifact --from accounts:test0 --args accounts:test0 TestToken TST 18 -a testtoken
```

This takes

- the contract artifact as the argument, which is `TokenContractArtifact`
- the deployer account, which we used `test0`
- the args that the contract constructor takes, which is the `admin` (`accounts:test0`), `name` (`TestToken`), `symbol` (`TST`), and `decimals` (`18`).
- an alias `testtoken` (`-a`) so we can easily reference it later with `contracts:testtoken`

On successful deployment, you should see something like this:

```bash
Contract deployed at 0x063a076da3e530c1f6cd7e598647d50c3ff0e4225c0767402f93f73f1c2c9174
Contract partial address 0x09c1b45b9a75cfaccf90c867da84f5180b75fdc6e1ec0e940750aead964a4c5b
Contract init hash 0x04cb120f3df6e270bb342d816f54562ce5dddb45132065d70cc40e43bb47b527
Deployment tx hash: 0x16edec75331f8b07da955c4cca4957c25857f6c0fe46fc68e7251bfbd74b1cbe
Deployment salt: 0x05a1f0a1bae0bb97eff002ac3de719c7e7fdd90db14161cb0c0898610120240a
Deployer: 0x0e900d357d0a7b9de3c0293c6b1a58dccfc1862f31c745ba5d3a5a5aaf4ac1fd
Transaction fee: 1101755679159600000
 Local processing time: 2.0s
 Node inclusion time: 3.0s
Contract stored in database with aliases last & testtoken
```

In the next step, let's mint some tokens!

## Minting public tokens

Call the public mint function like this:

```bash
aztec-wallet send mint_to_public --from accounts:test0 --contract-address contracts:testtoken --args accounts:test0 100
```

This takes

- the function name as the argument, which is `mint_to_public`
- the `from` account (caller) which is `accounts:test0`
- the contract address, which is aliased as `contracts:testtoken` (or simply `testtoken`)
- the args that the function takes, which is the account to mint the tokens into (`test0`), and `amount` (`100`).

This only works because we are using the secret key of the admin who has permissions to mint.

A successful call should print something like this:

```bash
Transaction hash: 0x1cf00af686c20860bc3621a47c6a892d9797c918ba09019431acf26fb16fa13e
Transaction has been proposed
 Tx fee: 609443487226800000
 Status: checkpointed
 Block number: 6
 Block hash: 0x23470fd2c6688da45b40df538eb3753f405deabc3ca17dc06f350aad764dbda6
 Local processing time: 1.5s
 Node inclusion time: 3.0s
Transaction hash stored in database with aliases last & mint_to_public-bd68d89b090987cb1a4cb7bd5b627361
```

You can double-check by calling the function that checks your public account balance:

```bash
aztec-wallet simulate balance_of_public --from test0 --contract-address testtoken --args accounts:test0
```

This should print

```bash
Simulation result:  100n
```

## Playing with hybrid state and private functions

In the following steps, we'll move some tokens from public to private state and check our private and public balance.

```bash
aztec-wallet send transfer_to_private --from accounts:test0 --contract-address testtoken --args accounts:test0 25
```

The arguments for `transfer_to_private` function are:

- the account address to transfer to
- the amount of tokens to send to private

A successful call should print something similar to what you've seen before.

Now when you call `balance_of_public` again you will see 75!

```bash
aztec-wallet simulate balance_of_public --from test0 --contract-address testtoken --args accounts:test0
```

This should print

```bash
Simulation result:  75n
```

And then call `balance_of_private` to check that you have your tokens!

```bash
aztec-wallet simulate balance_of_private --from test0 --contract-address testtoken --args accounts:test0
```

This should print

```bash
Simulation result:  25n
```

**Congratulations, you now know the fundamentals of working with the Aztec local network!** You are ready to move onto the more fun stuff.

## What's next?

Want to build something cool on Aztec?

- Check out the [Token Contract Tutorial](./docs/tutorials/contract_tutorials/token_contract.md) for a beginner tutorial, or jump into more advanced ones
- Ready for a live network? Try [deploying on testnet](./getting_started_on_testnet.md)
- Start on your own thing and check out the How To Guides to help you!

:::tip Need help?
If something does not work, see the [support guide](./support.md). It tells you when to ask in [Discord](https://discord.gg/aztec) or the [forum](https://forum.aztec.network), when to [open a GitHub issue](https://github.com/AztecProtocol/aztec-packages/issues/new?template=bug_report.yml), and how to disclose security issues responsibly.
:::
