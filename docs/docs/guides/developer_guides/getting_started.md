---
title: Getting Started
sidebar_position: 0
tags: [sandbox]
---

This guide will teach you how to install the Aztec sandbox, deploy your first smart contract, and interact with it using the CLI.

The Sandbox is an Aztec network running fully on your machine, and interacting with a development Ethereum node. You can develop and deploy on it just like on a testnet or mainnet. 

## Prerequisites

You need two global dependencies iyour machine:

- Node.js >= v18 (recommend installing with [nvm](https://github.com/nvm-sh/nvm))
- Docker (visit [this page of the Docker docs](https://docs.docker.com/get-docker/) on how to install it)

## Install and run the sandbox

**Start Docker**

Docker needs to be running in order to install the sandbox. Find instructions on the [Docker website](https://docs.docker.com/get-started/).

**Install the sandbox**

Run:

```bash
bash -i <(curl -s https://install.aztec.network)
```

This will install the following tools:

- **aztec** - launches various infrastructure subsystems (full sandbox, sequencer, prover, pxe, etc) and provides utility commands to interact with the network
- **aztec-nargo** - aztec's build of nargo, the noir compiler toolchain.
- **aztec-up** - a tool to upgrade the aztec toolchain to the latest, or specific versions.

**Start the sandbox**

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

Now you have the sandbox running, let's create an account. Open a new terminal window and run:

```bash
aztec-wallet create-account
```

This will create a new account in your sandbox. You will see logs telling you the address, public key, secret key, and more.

On successful depoyment of the account, you should see something like this:

```bash
New account:

Address:         0x22d82b1ef045dfb4c3e0c4eac41fcf04ba29a3468d5ef5a123e4754064a4038d
Public key:      0x24d07ed6baff3e12dd76e7299a771bfa430eed9e25b155e3253c958b0a93551f2012b9d0238581717e27b296124272053f53757942972df98ad6602369a4d2c92bdd202abb07ab331dd1e3d5595f00be5a1c9d3c3244e07453f38e83417b2a381a0039f104c8f2214611b7a645deb01bda7c79835a46cf6c78cd485bd4d1372a10844f6c07f18a8435c5998d7739be448c6b5c15688b7c228b0a7dc24b038de700d0d4af57aa6b07c4471bcdcc5228a17b1ac03f2aae84c33dd2933b6b5a1c70179399adacbfc836c8bf24741ea78d404fc803fe09cfc570560b16c1169a40be1f20f153e8e0e2f9856ee526723b49c6da81e82b382a8770e31c78f25a1784cc
Secret key:     0x1a9af8f75b3430223b628f7b423667da14304d376a82cfd31dfe138d00a20c61
Partial address: 0x198022f6ec9b51f3af4cdc731adf606c0143ad35f7947ad604db50e9310a31ac
Salt:            0x0000000000000000000000000000000000000000000000000000000000000000
Init hash:       0x04630e3997204b1c417868aa449beb272c3c3bf0efe22315c5920665a6390db7
Deployer:        0x0000000000000000000000000000000000000000000000000000000000000000

Waiting for account contract deployment...
Deploy tx hash:  09245ec0d905a461c717d6f70600e3c13b8746ee97785fd491b58f5f56111854
Deploy tx fee:   200013616
```

You can double check by running `aztec get-accounts`.

You will be needing that `Address` and `Secret key` fields later! To make it easier to reference, export them like this:

```bash
export ACCOUNT_ADDRESS=<ADDRESS>
export SECRET_KEY=<SECRET_KEY>
```
Make sure to replace the `<ADDRESS>` and `<SECRET_KEY>` with the actual results that were printed.

With this new account, let's get some local test tokens!

## Deploying a contract

The sandbox comes with some contracts that you can deploy and play with. One of these is an example token contract. 

Deploy it with this:

```bash
aztec deploy TokenContractArtifact --secret-key $SECRET_KEY --args $ACCOUNT_ADDRESS test-token TST 18
```

This takes 
- the contract artifact as the argument, which is `TokenContractArtifact`
- the secret key of the deployer account, which we exported as `$SECRET_KEY`
- the args that the contract constructor takes, which is the `admin` (`$ACCOUNT_ADDRESS`), `name` (`test-token`), `symbol` (`TST`), and `decimals` (`18`).

On successful deployment, you should see something like this:

```bash
 aztec:cli [INFO] Using wallet with address 0x22d82b1ef045dfb4c3e0c4eac41fcf04ba29a3468d5ef5a123e4754064a4038d +0ms
Contract deployed at 0x1eaa85d27c6ceed91f39a4885e2996f1f6de5d861c40dc9f0cfba43011b15243
Contract partial address 0x19e957e72ec743a91c341b6e148e41f57c503741ea95e5b6e7158892dcb9f347
Contract init hash 0x2f4bfd6cfa8f56f133bd0cd5ddfd1cb973436e0d385019491ce8fb950ae7eaf4
Deployment tx hash: 12e43da89dcb4fbc693419d37e2a01f8f381da49b2cd1ae8492cc91b98aafd08
Deployment salt: 0x115dd94b02568fc1f875fa782805151557684450f6aee058b28f9f010593e671
Deployment fee: 200943060
```

Nice one! Let's export the `Contract deployed at` address so we can use it to call the contract:

```bash
export CONTRACT_ADDRESS=<CONTRACT_ADDRESS>
```

Make sure to replace the `<CONTRACT_ADDRESS>` with the actual contract address that was printed.

In the next step, let's mint some tokens!

## Playing with public functions

Call the public mint function like this:

```bash
aztec send mint_public  --contract-artifact TokenContractArtifact --contract-address $CONTRACT_ADDRESS --secret-key $SECRET_KEY --args $ACCOUNT_ADDRESS 100 
```

This takes 
- the function name as the argument, whcih is `mint_public`
- the contract artifact, which is `TokenContractArtifact`
- the contract address, which we exported as `$CONTRACT_ADDRESS`
- the secret key of the caller of the function, which we exported as `$SECRET_KEY`
- the args that the function takes, which is the account to mint the tokens into (`$ACCOUNT_ADDRESS`), and `amount` (`100`).

This only works because we are using the secret key of the admin who has permissions to mint.

A successful call should print something like this:

```bash
aztec:cli [INFO] Using wallet with address 0x22d82b1ef045dfb4c3e0c4eac41fcf04ba29a3468d5ef5a123e4754064a4038d +0ms
Maximum total tx fee:   1161660
Estimated total tx fee: 116166
Estimated gas usage:    da=1127,l2=115039,teardownDA=0,teardownL2=0

Transaction hash: 28c6a544f8074d06b4d66adba582014c6ba1c1d2086f72a9c2d31cc638f5e865
Transaction has been mined
 Tx fee: 200106180
 Status: success
 Block number: 8
 Block hash: 2ac997cfa44bc5353acd3f82869d4171b1fc9970c11e6283df29571007f02e64
```

You can double-check by calling the function that checks your public account balance:

```bash
aztec simulate balance_of_public  --contract-artifact TokenContractArtifact --contract-address $CONTRACT_ADDRESS --args $ACCOUNT_ADDRESS 
```

This should print

```bash
Simulation result:  100n
```

## Playing with hybrid state and private functions

In the following steps, we'll shield a token (moving it from public to private state) and recheck our public balance.

First we need to generate a secret and secret hash:

```bash
 aztec generate-secret-and-hash
```

Export the output of the `secret_hash` to use in the next command:

```bash
export SECRET_HASH=<SECRET_HASH>
```

Call the `shield`` function like this:
```bash
aztec send shield  --contract-artifact TokenContractArtifact --contract-address $CONTRACT_ADDRESS --secret-key $SECRET_KEY --args $ACCOUNT_ADDRESS 25 $SECRET_HASH 0
```

This takes the same parameters as our previous `send` call, plus the arguments which are
- the account that is shielding the tokens (`$ACCOUNT_ADDRESS`)
- the number of tokens to shield (`25`)
- a `secret_hash` (`SECRET_HASH` which has been derived from a secret that you generated in the CLI)
- a `nonce` (`0` in this case).

A successful call should print something similar to what you've seen before.

Now when you call `balance_of_public` again you will see 75!

```bash
aztec simulate balance_of_public  --contract-artifact TokenContractArtifact --contract-address $CONTRACT_ADDRESS --args $ACCOUNT_ADDRESS 
```

This should print

```bash
Simulation result:  75n
```

Redeeming the tokens into your private balance requires adding a note into the Private Execution Environment (PXE), which is a bit complex for a getting-started guide. If you'd like to learn more about that flow, you can [read the PXE explainer in the Concepts section](../../aztec/concepts/pxe/index.md).

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
