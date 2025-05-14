---
title: Getting Started
sidebar_position: 0
tags: [sandbox, testnet]
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

Get started using the Aztec testnet or a local developer network (like Anvil for Aztec).

This guide will teach you how to install the Aztec toolbox, connect to a local or testnet node, and interact with contracts using the wallet CLI.

## Prerequisites

import { General, Fees } from '@site/src/components/Snippets/general_snippets';

You need two global dependencies on your machine:

- <General.node_ver />
- Docker (visit [this page of the Docker docs](https://docs.docker.com/get-docker/) on how to install it)

## Install toolbox

### Start Docker

Docker needs to be running in order to install the toolbox. Find instructions on the [Docker website](https://docs.docker.com/get-started/).

### Install `aztec`

Run:

<Tabs>
  <TabItem value="sandbox" label="Local network" default>
    ```bash
     VERSION=alpha-testnet bash -i <(curl -s https://install.aztec.network)
     ```

     Hit `y` when it asks `Do you wish to continue?`

     After it has been installed, run a local network with:

     ```bash
     aztec start --sandbox
     ```

    You will see the word `sandbox` a lot in the docs and when running a local network. The bundle of local network + Aztec toolbox + PXE is often called the Aztec Sandbox.

     When your local network is ready to go, you should see something like this:
     ```bash
     [INFO] Aztec Server listening on port 8080
     ```


  </TabItem>
  <TabItem value="testnet" label="Testnet">
    ```bash
     bash -i <(curl -s https://install.aztec.network)
     ```

      Hit `y` when it asks `Do you wish to continue?`
  </TabItem>
</Tabs>

This will install the following tools:

- **aztec** - launches various infrastructure subsystems (full sandbox, sequencer, prover, pxe, etc) and provides utility commands to interact with the network
- **aztec-nargo** - aztec's build of nargo, the noir compiler toolchain.
- **aztec-up** - a tool to upgrade the aztec toolchain to the latest, or specific versions.
- **aztec-wallet** - a tool for interacting with the aztec network

**Congratulations, you have just installed Aztec!**

```bash
 █████╗ ███████╗████████╗███████╗ ██████╗
██╔══██╗╚══███╔╝╚══██╔══╝██╔════╝██╔════╝
███████║  ███╔╝    ██║   █████╗  ██║
██╔══██║ ███╔╝     ██║   ██╔══╝  ██║
██║  ██║███████╗   ██║   ███████╗╚██████╗
╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝ ╚═════╝
```

## Step 1: Deploy an account

Aztec uses account abstraction, which means:

- All accounts are smart contracts (no EOAs)
- Account signature schemes are private
- Accounts only need deployment if they interact with public components
- Private contract interactions don't require account deployment

0. A little setup

<Tabs>
  <TabItem value="sandbox" label="Local network" default>
     The local network comes with some prefunded test accounts. Use this command to add them to your wallet:
    ```bash
    aztec-wallet import-test-accounts
    ```
    We'll use the first test account, `test0`, throughout to pay for transactions.
  </TabItem>
  <TabItem value="testnet" label="Testnet">
     Set these variables that we will use later:
     ```bash
     export NODE_URL=https://aztec-alpha-testnet-fullnode.zkv.xyz
     export SPONSORED_FPC_ADDRESS=0x0b27e30667202907fc700d50e9bc816be42f8141fae8b9f2281873dbdb9fc2e5
     ```
  </TabItem>
</Tabs>


1. Create and deploy a new account:

<Tabs>
  <TabItem value="sandbox" label="Local network" default>
    ```bash
    aztec-wallet create-account \
    -a my-wallet \
    --payment method=fee_juice,feePayer=test0
    ```
  </TabItem>
  <TabItem value="testnet" label="Testnet">
    ```bash
     aztec-wallet create-account \
    --register-only \
    --node-url $NODE_URL \
    --alias my-wallet
     ```

     Then register your account with the fee sponsor contract:
     ```bash
     aztec-wallet register-contract \
     --node-url $NODE_URL \
     --from my-wallet \
     --alias sponsoredfpc \
     $SPONSORED_FPC_ADDRESS SponsoredFPC \
     --salt 0
     ```
This means you won't have to pay fees - a sponsor contract will pay them for you. Fees on Aztec are abstracted, so you can pay publicly or privately (even without the sequencer knowing who you are).

You should see that the contract `SponsoredFPC` was added at a specific address.

Then you can deploy your account (required as we will be using public functions):

```bash
aztec-wallet deploy-account \
    --node-url $NODE_URL \
    --from my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --register-class
```

Note: The first time you run these commands, it will take longer as some binaries are installed. This command is generating a client-side proof!

You should see the tx hash in your terminal.

If you see an error like `Timeout awaiting isMined` please note this is not an actual error. The transaction has still been sent and is simply waiting to be mined. You may see this if the network is more congested than normal. You can proceed to the next step.

  </TabItem>
</Tabs>

## Step 2: Deploy and interact with a token contract

1. Deploy a token contract:

<Tabs>
  <TabItem value="sandbox" label="Local network" default>
    ```bash
    aztec-wallet deploy TokenContractArtifact \
    --from accounts:test0 \
     --args accounts:test0 TestToken TST 18 \
     -a testtoken
    ```
  </TabItem>
  <TabItem value="testnet" label="Testnet">
    ```bash
aztec-wallet deploy \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --alias token \
    TokenContract \
    --args accounts:my-wallet Token TOK 18
```

  </TabItem>
</Tabs>

You should see confirmation that the token contract is stored in the database.

2. Mint 10 private tokens to yourself:

<Tabs>
  <TabItem value="sandbox" label="Local network" default>
```bash
aztec-wallet send mint_to_private \
 --from accounts:test0 \
 --contract-address contracts:testtoken \
 --args accounts:test0 100
```
  </TabItem>
  <TabItem value="testnet" label="Testnet">
    ```bash
aztec-wallet send mint_to_private \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --contract-address last \
    --args accounts:my-wallet accounts:my-wallet 100
```

  </TabItem>
</Tabs>

You should see confirmation that the tx hash is stored in the database.

3. Send 25 private tokens to public:

<Tabs>
  <TabItem value="sandbox" label="Local network" default>
```bash
aztec-wallet send transfer_to_public \
--from accounts:test0 \
--contract-address testtoken \
--args accounts:test0 25
```
  </TabItem>
  <TabItem value="testnet" label="Testnet">
```bash
aztec-wallet send transfer_to_public \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --contract-address last \
    --args accounts:my-wallet accounts:my-wallet 25 0
```
  </TabItem>
</Tabs>

You should see confirmation that the tx hash is stored in the database.

4. Check your balances

<Tabs>
  <TabItem value="sandbox" label="Local network" default>

  Private balance:
  ```bash
aztec-wallet simulate balance_of_private \
--from test0 \
--contract-address testtoken \
--args accounts:test0
```
  You should see `75n`.

Public balance:

```bash
aztec-wallet simulate balance_of_public \
--from test0 \
--contract-address testtoken \
--args accounts:test0
```
  </TabItem>
  <TabItem value="testnet" label="Testnet">
Private balance:

```bash
aztec-wallet simulate balance_of_private \
    --node-url $NODE_URL \
    --from my-wallet \
    --contract-address last \
    --args accounts:my-wallet
```

You should see `75n`.

Public balance:

```bash
aztec-wallet simulate balance_of_public \
    --node-url $NODE_URL \
    --from my-wallet \
    --contract-address last \
    --args accounts:my-wallet
```

You should see `25n`.

  </TabItem>
</Tabs>

## Next Steps

**Congratulations, you now know the fundamentals of working with Aztec!** You are ready to move onto the more fun stuff.

## What's next?

Click the Next button below to continue on your journey and write your first Aztec smart contract.
