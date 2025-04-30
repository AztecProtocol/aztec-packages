---
title: Getting Started
sidebar_position: 0
tags: [sandbox. testnet]
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

Get started on your local environment using the sandbox, or jump right into playing with the testnet.

<Tabs>

<TabItem value="sandbox" label="Local Sandbox">
     
The Sandbox is an local development Aztec network running fully on your machine, and interacting with a development Ethereum node. You can develop and deploy on it just like on a testnet or mainnet (when the time comes). The sandbox makes it faster and easier to develop and test your Aztec applications.

What's included in the sandbox:

- Local Ethereum network (Anvil)
- Deployed Aztec protocol contracts (for L1 and L2)
- A set of test accounts with some test tokens to pay fees
- Development tools to compile contracts and interact with the network (`aztec-nargo` and `aztec-wallet`)

All of this comes packages in a Docker container to make it easy to install and run.

This guide will teach you how to install the Aztec sandbox, run it using the Aztec CLI, and interact with contracts using the wallet CLI. To jump right into the testnet instead, click the `Testnet` tab.

## Prerequisites

You need two global dependencies on your machine:

- Node.js {'>='} v18.xx.x and {'<='} v20.17.x (lts/iron) (later versions, eg v22.9, gives an error around 'assert')
  - Recommend installing with [nvm](https://github.com/nvm-sh/nvm)
- Docker (visit [this page of the Docker docs](https://docs.docker.com/get-docker/) on how to install it)

## Install and run the sandbox

### Start Docker

Docker needs to be running in order to install the sandbox. Find instructions on the [Docker website](https://docs.docker.com/get-started/).

### Install the sandbox

Run:

```bash
-i <(curl -s https://install.aztec.network)
```

This will install the following tools:

- **aztec** - launches various infrastructure subsystems (full sandbox, sequencer, prover, pxe, etc) and provides utility commands to interact with the network
- **aztec-nargo** - aztec's build of nargo, the noir compiler toolchain.
- **aztec-up** - a tool to upgrade the aztec toolchain to the latest, or specific versions.
- **aztec-wallet** - a tool for interacting with the aztec network

### Start the sandbox

Once these have been installed, to start the sandbox, run:

```bash
aztec start --sandbox
```

**Congratulations, you have just installed and run the Aztec Sandbox!**

```bash
     /\        | |
    /  \    ___| |_ ___  ___
   / /\ \  |_  / __/ _ \/ __|
  / ____ \  / /| ||  __/ (__
 /_/___ \_\/___|\__\___|\___|

```

In the terminal, you will see some logs:

1. Sandbox version
2. Contract addresses of rollup contracts
3. PXE (private execution environment) setup logs
4. Initial accounts that are shipped with the sandbox and can be used in tests

You'll know the sandbox is ready to go when you see something like this:

```bash
[INFO] Aztec Server listening on port 8080
```

## Using the sandbox test accounts

import { CLI_Add_Test_Accounts } from '@site/src/components/Snippets/general_snippets';

<CLI_Add_Test_Accounts />

To add the test accounts, run this in another terminal:

```bash
aztec-wallet import-test-accounts
```

We'll use the first test account, `test0`, throughout to pay for transactions.

## Creating an account in the sandbox

```bash
aztec-wallet create-account -a my-wallet --payment method=fee_juice,feePayer=test0
```

This will create a new wallet with an account and give it the alias `my-wallet`. Accounts can be referenced with `accounts:<alias>`. You will see logs telling you the address, public key, secret key, and more.

On successful depoyment of the account, you should see something like this:

```bash
New account:

Address:         0x066108a2398e3e2ff53ec4b502e4c2e778c6de91bb889de103d5b4567530d99c
Public key:      0x007343da506ea513e6c05ba4d5e92e3c682333d97447d45db357d05a28df0656181e47a6257e644c3277c0b11223b28f2b36c94f9b0a954523de61ac967b42662b60e402f55e3b7384ba61261335040fe4cd52cb0383f559a36eeea304daf67d1645b06c38ee6098f90858b21b90129e7e1fdc4666dd58d13ef8fab845b2211906656d11b257feee0e91a42cb28f46b80aabdc70baad50eaa6bb2c5a7acff4e30b5036e1eb8bdf96fad3c81e63836b8aa39759d11e1637bd71e3fc76e3119e500fbcc1a22e61df8f060004104c5a75b52a1b939d0f315ac29013e2f908ca6bc50529a5c4a2604c754d52c9e7e3dee158be21b7e8008e950991174e2765740f58
Secret key:     0x1c94f8b19e91d23fd3ab6e15f7891fde7ba7cae01d3fa94e4c6afb4006ec0cfb
Partial address: 0x2fd6b540a6bb129dd2c05ff91a9c981fb5aa2ac8beb4268f10b3aa5fb4a0fcd1
Salt:            0x0000000000000000000000000000000000000000000000000000000000000000
Init hash:       0x28df95b579a365e232e1c63316375c45a16f6a6191af86c5606c31a940262db2
Deployer:        0x0000000000000000000000000000000000000000000000000000000000000000

Waiting for account contract deployment...
Deploy tx hash:  0a632ded6269bda38ad6b54cd49bef033078218b4484b902e326c30ce9dc6a36
Deploy tx fee:   200013616
Account stored in database with aliases last & my-wallet
```

You may need to scroll up as there are some other logs printed after it.

You can double check by running `aztec-wallet get-alias accounts:my-wallet`.

For simplicity we'll keep using the test account, let's deploy our own test token!

## Deploying a contract

The sandbox comes with some contracts that you can deploy and play with. One of these is an example token contract.

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
aztec:wallet [INFO] Using wallet with address 0x066108a2398e3e2ff53ec4b502e4c2e778c6de91bb889de103d5b4567530d99c +0ms
Contract deployed at 0x15ce68d4be65819fe9c335132f10643b725a9ebc7d86fb22871f6eb8bdbc3abd
Contract partial address 0x25a91e546590d77108d7b184cb81b0a0999e8c0816da1a83a2fa6903480ea138
Contract init hash 0x0abbaf0570bf684da355bd9a9a4b175548be6999625b9c8e0e9775d140c78506
Deployment tx hash: 0a8ccd1f4e28092a8fa4d1cb85ef877f8533935c4e94b352a38af73eee17944f
Deployment salt: 0x266295eb5da322aba96fbb24f9de10b2ba01575dde846b806f884f749d416707
Deployment fee: 200943060
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
aztec:wallet [INFO] Using wallet with address 0x066108a2398e3e2ff53ec4b502e4c2e778c6de91bb889de103d5b4567530d99c +0ms
Maximum total tx fee:   1161660
Estimated total tx fee: 116166
Estimated gas usage:    da=1127,l2=115039,teardownDA=0,teardownL2=0

Transaction hash: 2ac383e8e2b68216cda154b52e940207a905c1c38dadba7a103c81caacec403d
Transaction has been mined
 Tx fee: 200106180
 Status: success
 Block number: 17
 Block hash: 1e27d200600bc45ab94d467c230490808d1e7d64f5ee6cee5e94a08ee9580809
Transaction hash stored in database with aliases last & mint_to_public-9044
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

In the following steps, we'll moving some tokens from public to private state, and check our private and public balance.

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

**Congratulations, you now know the fundamentals of working with the Aztec sandbox!** You are ready to move onto the more fun stuff.

## What's next?

Click the Next button below to continue on your journey and write your first Aztec smart contract.

</TabItem>

<TabItem value="testnet" label="Testnet" default>
   
This guide will walk you through setting up and using the Aztec testnet. By the end, you'll have created an account, deployed a contract, and performed some basic operations.

If you already have an app on sandbox, you might want to check out the [sandbox to testnet guide](../sandbox_to_testnet_guide.md).

## Key Terms

In this guide you will see these terms:

- **aztec**: a command-line tool for interacting with aztec testnet (& sandbox local environments)
- **aztec-nargo**: a command-line tool for compiling contracts
- **aztec.nr**: a Noir library used for writing Aztec smart contracts
- **aztec-wallet**: A tool for creating and interacting with Aztec wallets
- **sandbox**: A local development environment

## Prerequisites

Before you begin, you'll need to install:

1. [Docker](https://docs.docker.com/get-started/get-docker/)

## Install Aztec CLI

Run this:

```sh
bash -i <(curl -s https://install.aztec.network)
```

Then install the version of the network running the testnet:

```bash
aztec-up 0.85.0-alpha-testnet.3
```

:::warning

The testnet is version dependent. It is currently running version `0.85.0-alpha-testnet.3`. Maintain version consistency when interacting with the testnet to reduce errors.

:::

## Step 1: Deploy an account to testnet

Aztec uses account abstraction, which means:

- All accounts are smart contracts (no EOAs)
- Account signature schemes are private
- Accounts only need deployment if they interact with public components
- Private contract interactions don't require account deployment

0. Set some variables that we need:

```bash
export NODE_URL=http://34.107.66.170
export SPONSORED_FPC_ADDRESS=0x0b27e30667202907fc700d50e9bc816be42f8141fae8b9f2281873dbdb9fc2e5
```

1. Create a new account:

```bash
aztec-wallet create-account \
    --register-only \
    --node-url $NODE_URL \
    --alias my-wallet
```

You should see the account information displayed in your terminal.

2. Register your account with the fee sponsor contract:

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

3. Deploy your account (required as we will be using public functions):

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

## Step 2: Deploy and interact with a token contract

1. Deploy a token contract:

```bash
aztec-wallet deploy \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --alias token \
    TokenContract \
    --args accounts:my-wallet Token TOK 18
```

You should see confirmation that the token contract is stored in the database.

2. Mint 10 private tokens to yourself:

```bash
aztec-wallet send mint_to_private \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --contract-address last \
    --args accounts:my-wallet accounts:my-wallet 10
```

You should see confirmation that the tx hash is stored in the database.

3. Send 2 private tokens to public:

```bash
aztec-wallet send transfer_to_public \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --contract-address last \
    --args accounts:my-wallet accounts:my-wallet 2 0
```

You should see confirmation that the tx hash is stored in the database.

4. Check your balances

Private balance:

```bash
aztec-wallet simulate balance_of_private \
    --node-url $NODE_URL \
    --from my-wallet \
    --contract-address last \
    --args accounts:my-wallet
```

You should see `8n`.

Public balance:

```bash
aztec-wallet simulate balance_of_public \
    --node-url $NODE_URL \
    --from my-wallet \
    --contract-address last \
    --args accounts:my-wallet
```

You should see `2n`.

## Next Steps

Congratulations! You've now learned the fundamentals of working with the Aztec testnet. Here are some resources to continue your journey:

* [Aztec Playground](https://play.aztec.network/)
* [Tutorials](./tutorials/codealong/contract_tutorials/counter_contract.md)
* [Guide to run a node](../the_aztec_network/index.md)

</TabItem>
</Tabs>