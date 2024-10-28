---
title: Getting Started
sidebar_position: 0
tags: [sandbox]
---

This guide will teach you how to install the Aztec sandbox, run it using the Aztec CLI, and interact with contracts using the wallet CLI.

The Sandbox is an Aztec network running fully on your machine, and interacting with a development Ethereum node. You can develop and deploy on it just like on a testnet or mainnet.

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
bash -i <(curl -s https://install.aztec.network)
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

## Creating an account in the sandbox

Now you have the sandbox running, let's create an account. For the next steps, we will use the wallet CLI. Open a new terminal window and run:

```bash
aztec-wallet create-account -a my-wallet
```

This will create a new wallet with an account and give it the alias `my-wallet`. This will let us reference it with `accounts:my-wallet`. You will see logs telling you the address, public key, secret key, and more.

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

You can double check by running `aztec-wallet get-alias accounts:my-wallet`.

With this new account, let's get some local test tokens!

## Deploying a contract

The sandbox comes with some contracts that you can deploy and play with. One of these is an example token contract.

Deploy it with this:

```bash
aztec-wallet deploy TokenContractArtifact --from accounts:my-wallet --args accounts:my-wallet TestToken TST 18 -a testtoken
```

This takes

- the contract artifact as the argument, which is `TokenContractArtifact`
- the deployer account, which we aliased as `my-wallet`
- the args that the contract constructor takes, which is the `admin` (`accounts:my-wallet`), `name` (`TestToken`), `symbol` (`TST`), and `decimals` (`18`).
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
aztec-wallet send mint_public --from accounts:my-wallet --contract-address contracts:testtoken --args accounts:my-wallet 100
```

This takes

- the function name as the argument, which is `mint_public`
- the `from` account (caller) which is `accounts:my-wallet`
- the contract address, which is aliased as `contracts:testtoken` (or simply `testtoken`)
- the args that the function takes, which is the account to mint the tokens into (`my-wallet`), and `amount` (`100`).

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
Transaction hash stored in database with aliases last & mint_public-9044
```

You can double-check by calling the function that checks your public account balance:

```bash
aztec-wallet simulate balance_of_public --from my-wallet --contract-address testtoken --args accounts:my-wallet
```

This should print

```bash
Simulation result:  100n
```

## Playing with hybrid state and private functions

In the following steps, we'll shield a token (moving it from public to private state), and check our private and public balance.

First we need to generate a secret and secret hash with the alias `shield`:

```bash
aztec-wallet create-secret -a shield
```

Call the `shield` function like this:

```bash
aztec-wallet send shield --from accounts:my-wallet --contract-address testtoken --args accounts:my-wallet 25 secrets:shield:hash 0
```

This takes the same parameters as our previous `send` call, with the arguments for `shield` function which are:

- the number of tokens to shield (`25`)
- a `secret_hash` (`SECRET_HASH` which has been derived from a secret that you generated in the CLI)
- a `nonce` (`0` in this case).

A successful call should print something similar to what you've seen before.

Now when you call `balance_of_public` again you will see 75!

```bash
aztec-wallet simulate balance_of_public --from my-wallet --contract-address testtoken --args accounts:my-wallet
```

This should print

```bash
Simulation result:  75n
```

Now we will need to add these shielded tokens into our account's environment so that we have the correct information to claim them.

```bash
aztec-wallet add-note TransparentNote pending_shields --contract-address testtoken --transaction-hash last --address accounts:my-wallet --body 25 secrets:shield:hash
```

This takes

- the type of note you are claiming (`TransparentNote`)
- the name of the storage (`pending_shields`)
- the contract address
- the transaction hash the note was created in (automatically aliased as `last`)
- the address to claim the note into (`accounts:my-wallet`)

Don't worry if you don't understand what `TransparentNote` or `add-note` mean just yet. When you follow the tutorials, you'll learn more.

A successful result will not print anything.

Now you can redeem the shielded tokens:

```bash
aztec-wallet send redeem_shield --contract-address testtoken --args accounts:my-wallet 25 secrets:shield --from accounts:my-wallet
```

And then call `balance_of_private` to check that you have your tokens!

```bash
aztec-wallet simulate balance_of_private --from my-wallet --contract-address testtoken --args accounts:my-wallet
```

This should print

```bash
Simulation result:  25n
```

**Congratulations, you now know the fundamentals of working with the Aztec sandbox!** You are ready to move onto the more fun stuff.

## What's next?

Now you have a development network running, so you're ready to start coding your first app with Aztec.nr and Aztec.js!

If you want to start coding, head over to the Tutorials & Examples section and write & deploy your first smart contract.

<div className="card-container full-width">
  <Card shadow='tl' link='/tutorials/codealong/contract_tutorials/counter_contract'>
    <CardHeader>
      <h3>Write your first contract</h3>
    </CardHeader>
    <CardBody>
     Write and deploy a simple private counter smart contract on your local sandbox
    </CardBody>
  </Card>
</div>
