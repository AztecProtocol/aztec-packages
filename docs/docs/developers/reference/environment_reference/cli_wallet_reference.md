---
title: CLI Wallet
tags: [sandbox, wallet, cli]
keywords: [wallet, cli wallet]
sidebar_position: 3
---

For development, it may be useful to deploy, transact, or create notes in a non-programmatic way. You can use the CLI wallet (`aztec-wallet`) for thing such as:

- Deploying contracts
- Sending transactions
- Bridging L1 "Fee Juice" into Aztec
- Pushing arbitrary [notes](../../guides/smart_contracts/writing_contracts/notes/index.md) to your PXE
- Creating [authwits](../../guides/smart_contracts/writing_contracts/authwit.md)
- Aliasing info and secrets for further usage
- Proving your transactions and profile gate counts

`aztec-wallet` functions as a user wallet. It runs a PXE and has persistent storage to remember user accounts, notes and registered contracts.

:::info

At any time, you can get an updated version of the existing commands and subcommands by adding `-h`. For example:

```bash
aztec-wallet create-account -h
```

:::


### Global Options

The CLI wallet supports several global options that can be used with any command:

- `-V, --version`: Output the version number
- `-d, --data-dir <string>`: Storage directory for wallet data (default: "~/.aztec/wallet")
- `-p, --prover <string>`: The type of prover the wallet uses (choices: "wasm", "native", "none", default: "native", env: `PXE_PROVER`)
- `--remote-pxe`: Connect to an external PXE RPC server instead of the local one (env: `REMOTE_PXE`)
- `-n, --node-url <string>`: URL of the Aztec node to connect to (default: "http://host.docker.internal:8080", env: `AZTEC_NODE_URL`)
- `-h, --help`: Display help for command

:::info
Many options can be set using environment variables. For example:
- `PXE_PROVER`: Set the prover type
- `REMOTE_PXE`: Enable remote PXE connection
- `AZTEC_NODE_URL`: Set the node URL
- `SECRET_KEY`: Set the secret key for account operations
:::

### Connect to the Testnet

To connect to the testnet, pass the `AZTEC_NODE_URL` to the wallet with the `--node-url` (`-n`) option.

```bash
export AZTEC_NODE_URL=<testnet-node-ip-address>
aztec get-canonical-sponsored-fpc-address
# Save the returned Sponsored FPC address
# Register a new account
aztec-wallet create-account --register-only -a main -n $AZTEC_NODE_URL

# [22:50:24.286] ERROR: wallet Error: Contract address mismatch: expected 0x0b27e30667202907fc700d50e9bc816be42f8141fae8b9f2281873dbdb9fc2e5, got 0x00b7a405f8b873dbdccb0bc6b7a209ae6b87c76ca4bc5cb75fea3027726f6fa0


aztec-wallet create-account -n $AZTEC_NODE_URL --payment method=fpc-sponsored,fpc=<sponsored-fpc-address>
```

### Payment Options

Many commands support payment options for transaction fees:

```bash
--payment method=<name>,feePayer=<address>,asset=<address>,fpc=<address>,claim=<bool>,claimSecret=<string>,claimAmount=<number>,messageLeafIndex=<number>,feeRecipient=<address>
```

Valid payment methods:
- `fee_juice`: Pay with fee juice (default)
- `fpc-public`: Pay with a public FPC
- `fpc-private`: Pay with a private FPC
- `fpc-sponsored`: Pay with a sponsored FPC

### Gas Options

Commands that send transactions support gas-related options:

```bash
--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>
--max-fees-per-gas <da=100,l2=100>
--max-priority-fees-per-gas <da=0,l2=0>
--no-estimate-gas
--estimate-gas-only
```

### Proving transactions

You can prove a transaction using the aztec-wallet with a running sandbox. Follow the guide [here](../../guides/local_env/sandbox_proving.md#proving-with-aztec-wallet). Proving transactions is required when interacting with the testnet.

## Aliases

The CLI wallet makes extensive use of aliases, that is, when an address, artifact, secret, or other information is given a name that can be later used to reference it.

Aliases have different types like `address` or `artifact` or `contract`. You can see a list of these types by running the help command `aztec-wallet alias -h`. You can then specify a type with the `:` character whenever needed. For example `accounts:master_yoda` or `artifacts:light_saber`.

:::tip

The wallet writes to the `last` alias if it's likely that you use that same alias in the next command.

It will also try to determine which type is expected. For example, if the alias `master_yoda` is an account, you don't need to prepend `account:` if, for example, you're deploying a contract.

You can create arbitrary aliases with the `alias` command. For example `aztec-wallet alias accounts test_alias 0x2c37902cdade7710bd2355e5949416dc5e43a16e0b13a5560854d2451d92d289`.

:::

## Paying Fees

import { Why_Fees, CLI_Fees } from '/components/snippets';

<Why_Fees />

Below are all the payment methods available to pay transaction fees on Aztec, starting with the simplest.

### Fee Paying Contract

Fee paying contracts specify their own criteria of payment in exchange for paying the fee juice of a transaction, e.g. an FPC
be written to accept some banana tokens to pay for another's transaction fee.

Before using a fee paying contract, you need to register it in the PXE, passing the address of the contract and specifying the `from` account (in this case `main`). For example:

```bash
aztec-wallet register-contract $FPC_ADDRESS FPCContract -f main
```

With an alias corresponding to the FPC's address (`bananaFPC`) this would be:

```bash
aztec-wallet <your transaction> --payment method=fpc,fpc-contract=contracts:bananaFPC
```

### Sponsored Fee Paying Contract

Before using a Sponsored Fee Paying Contract (FPC), you need to register it in the PXE, passing the address of the contract and specifying the `from` account (in this case `main`). For example:

```bash
aztec-wallet register-contract $FPC_ADDRESS SponsoredFPC -f main
```

This is a special type of FPC that can be used to pay for account deployment and regular txs.
Eg: to create an account paid for by the sponsoredFPC:

```bash
aztec-wallet create-account -a main --payment method=fpc-sponsored,fpc=$FPC_ADDRESS
```

:::note
In the sandbox, the sponsored FPC address is printed at the end of its initial logs.
:::

### Fee Juice from Sandbox Test accounts

In the sandbox pre-loaded test accounts can be used to cover fee juice when deploying contracts.

First import them:

#include_code import-test-accounts yarn-project/cli-wallet/test/flows/basic.sh bash

Then use the alias (test0, test1...) when paying in fee juice. Eg to create accounts:

#include_code declare-accounts yarn-project/end-to-end/src/guides/up_quick_start.sh bash

### Mint and Bridge Fee Juice

#### On Sandbox

First register an account, mint the fee asset on L1 and bridge it to fee juice:

#include_code bridge-fee-juice yarn-project/cli-wallet/test/flows/create_account_pay_native.sh bash

You'll have to wait for two blocks to pass for bridged fee juice to be ready on Aztec.
For the sandbox you do this by putting through two arbitrary transactions. Eg:

#include_code force-two-blocks yarn-project/cli-wallet/test/flows/create_account_pay_native.sh bash

Now the funded account can deploy itself with the bridged fees, claiming the bridged fee juice and deploying the contract in one transaction:

#include_code claim-deploy-account yarn-project/cli-wallet/test/flows/create_account_pay_native.sh bash

#### Minting on Testnet

This will mint the max amount of fee juice on L1 and bridge it to L2.

```bash
aztec-wallet bridge-fee-juice <AztecAddress>
```

## Account Management

The wallet comes with some options for account deployment and management. You can register and deploy accounts, or only register them, and pass different options to serve your workflow.

### Create Account

Generates a secret key and deploys an account contract. Uses a Schnorr single-key account which uses the same key for encryption and authentication (not secure for production usage).

#### Options

- `--skip-initialization`: Skip initializing the account contract. Useful for publicly deploying an existing account.
- `--public-deploy`: Publicly deploys the account and registers the class if needed.
- `-p, --public-key <string>`: Public key that identifies a private signing key stored outside of the wallet. Used for ECDSA SSH accounts over the secp256r1 curve.
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `-sk, --secret-key <string>`: Secret key for account. Uses random by default. (env: `SECRET_KEY`)
- `-a, --alias <string>`: Alias for the account. Used for easy reference in subsequent commands.
- `-t, --type <string>`: Type of account to create (choices: "schnorr", "ecdsasecp256r1", "ecdsasecp256r1ssh", "ecdsasecp256k1", default: "schnorr")
- `--register-only`: Just register the account on the PXE. Do not deploy or initialize the account contract.
- `--json`: Emit output as json
- `--no-wait`: Skip waiting for the contract to be deployed. Print the hash of deployment transaction
- `--payment <options>`: Fee payment method and arguments (see Payment Options section)
- `--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>`: Gas limits for the tx
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation
- `--max-priority-fees-per-gas <da=0,l2=0>`: Maximum priority fees per gas unit for DA and L2 computation
- `--no-estimate-gas`: Whether to automatically estimate gas limits for the tx
- `--estimate-gas-only`: Only report gas estimation for the tx, do not send it

#### Example

```bash
aztec-wallet create-account -a master_yoda
```

### Deploy account

Deploy an account that is already registered (i.e. your PXE knows about it) but not deployed. Most times you should pass an alias or address registered in the PXE by passing the `-f` or `--from` flag.

#### Example

```bash
$ aztec-wallet create-account --register-only -a master_yoda
...
$ aztec-wallet deploy-account -f master_yoda
```

## Contracts Actions

### Deploy Contract

Deploys a compiled Aztec.nr contract to Aztec.

You can deploy a [compiled contract](../../guides/smart_contracts/how_to_compile_contract.md) to the network.

#### Options

- `--init <string>`: The contract initializer function to call (default: "constructor")
- `--no-init`: Leave the contract uninitialized
- `-k, --public-key <string>`: Optional encryption public key for this address. Set this value only if this contract is expected to receive private notes.
- `-s, --salt <hex string>`: Optional deployment salt as a hex string for generating the deployment address.
- `--universal`: Do not mix the sender address into the deployment.
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `--args [args...]`: Constructor arguments
- `-sk, --secret-key <string>`: The sender's secret key
- `--json`: Emit output as json
- `--no-wait`: Skip waiting for the contract to be deployed. Print the hash of deployment transaction
- `--no-class-registration`: Don't register this contract class
- `--no-public-deployment`: Don't emit this contract's public bytecode
- `--payment <options>`: Fee payment method and arguments (see Payment Options section)
- `--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>`: Gas limits for the tx
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation
- `--max-priority-fees-per-gas <da=0,l2=0>`: Maximum priority fees per gas unit for DA and L2 computation
- `--no-estimate-gas`: Whether to automatically estimate gas limits for the tx
- `--estimate-gas-only`: Only report gas estimation for the tx, do not send it

#### Example

```bash
aztec-wallet deploy ./target/jedi_code.nr --arg accounts:master_yoda --from master_yoda --alias jedi_order
```

### Register Contract

Registers a contract in this wallet's PXE. A contract must be registered in the user's PXE in order to interact with it.

#### Options

- `--init <string>`: The contract initializer function to call (default: "constructor")
- `-k, --public-key <string>`: Optional encryption public key for this address. Set this value only if this contract is expected to receive private notes.
- `-s, --salt <hex string>`: Optional deployment salt as a hex string for generating the deployment address.
- `--deployer <string>`: The address of the account that deployed the contract
- `--args [args...]`: Constructor arguments
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `-f, --from <string>`: Alias or address of the account to simulate from
- `-a, --alias <string>`: Alias for the contact. Used for easy reference in subsequent commands.

#### Example

```bash
aztec-wallet register-contract <address> <artifact> -a <alias>
```


### Send Transaction

Calls a function on an Aztec contract.

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `--args [args...]`: Function arguments
- `-ca, --contract-address <address>`: Aztec address of the contract
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-f, --from <string>`: Alias or address of the account to send from
- `--payment <options>`: Fee payment method and arguments (see Payment Options section)
- `--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>`: Gas limits for the tx
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation
- `--max-priority-fees-per-gas <da=0,l2=0>`: Maximum priority fees per gas unit for DA and L2 computation
- `--no-estimate-gas`: Whether to automatically estimate gas limits for the tx
- `--estimate-gas-only`: Only report gas estimation for the tx, do not send it

#### Example

```bash
aztec-wallet send --from master_yoda --contract-address jedi_order --args "luke skywalker" train_jedi
```

### Simulate Transaction

Simulates the execution of a function on an Aztec contract.

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `--args [args...]`: Function arguments
- `-ca, --contract-address <address>`: Aztec address of the contract
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-f, --from <string>`: Alias or address of the account to simulate from

#### Example

```bash
aztec-wallet simulate --from master_yoda --contract-address jedi_order --args "luke_skywalker" train_jedi
```

### Profile Transaction

Profiles a private function by counting the unconditional operations in its execution steps.

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `--args [args...]`: Function arguments
- `-ca, --contract-address <address>`: Aztec address of the contract
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format
- `--debug-execution-steps-dir <address>`: Directory to write execution step artifacts for bb profiling/debugging
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-aw, --auth-witness <string,...>`: Authorization witness to use for the simulation
- `-f, --from <string>`: Alias or address of the account to simulate from

#### Example

```bash
aztec-wallet profile --from master_yoda --contract-address jedi_order --args "luke_skywalker" train_jedi
```


### Create AuthWit

Creates an authorization witness that can be privately sent to a caller so they can perform an action on behalf of the provided account. These allow you to authorize the caller to execute an action on behalf of an account. They get aliased into the `authwits` type.

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `--args [args...]`: Function arguments
- `-ca, --contract-address <address>`: Aztec address of the contract
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-f, --from <string>`: Alias or address of the account to simulate from
- `-a, --alias <string>`: Alias for the authorization witness. Used for easy reference in subsequent commands.

#### Private AuthWit Example

The authwit management in private is a two-step process: create and add. It's not too different from a `send` command, but providing the caller that can privately execute the action on behalf of the caller.

An example for authorizing an operator (ex. a DeFi protocol) to call the transfer_in_private action (transfer on the user's behalf):

```bash
# Create the authorization witness
aztec-wallet create-authwit transfer_in_private accounts:main -ca contracts:token --args accounts:jedi_master accounts:main 20 secrets:auth_nonce -f accounts:jedi_master

# Add the authorization witness
aztec-wallet add-authwit authwits:secret_trade accounts:jedi_master -f accounts:main
```

### Authorize Action

Authorizes a public call on the caller, so they can perform an action on behalf of the provided account. This is the public equivalent of creating an authwit.

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `--args [args...]`: Function arguments
- `-ca, --contract-address <address>`: Aztec address of the contract
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-f, --from <string>`: Alias or address of the account to simulate from

#### Public AuthWit Example

A similar call to the above, but in public:

```bash
aztec-wallet authorize-action transfer_in_public accounts:coruscant_trader -ca contracts:token --args accounts:jedi_master accounts:coruscant_trader 20 secrets:auth_nonce -f accounts:jedi_master
```

### Bridge Fee Juice

The wallet provides an easy way to mint the fee-paying asset on L1 and
bridging it to L2. Current placeholder-name "fee juice".

Using the sandbox, there's already a Fee Juice contract that manages this
enshrined asset. You can optionally mint more Juice before bridging it.
Mints L1 Fee Juice and pushes them to L2.

#### Options

- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated)
- `-m, --mnemonic <string>`: The mnemonic to use for deriving the Ethereum address that will mint and bridge
- `--mint`: Mint the tokens on L1 (default: false)
- `--l1-private-key <string>`: The private key to the eth account bridging
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337)
- `--json`: Output the claim in JSON format
- `--no-wait`: Wait for the bridged funds to be available in L2, polling every 60 seconds
- `--interval <number>`: The polling interval in seconds for the bridged funds (default: "60")

#### Example

This example mints and bridges 1000 units of fee juice and bridges it to the `master_yoda` recipient on L2.

```bash
aztec-wallet bridge-fee-juice --mint 1000 master_yoda
```

### Get Transaction Status

You can check the status of recent transactions or get detailed information about a specific transaction.

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `--json`: Output the result in JSON format

#### Example

```bash
# Get status of recent transactions
aztec-wallet get-tx

# Get detailed view of a specific transaction
aztec-wallet get-tx <txHash>
```

### Cancel Transaction

You can cancel a pending transaction by reusing its nonce with a higher fee and an empty payload.

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `--json`: Output the result in JSON format

#### Example

```bash
aztec-wallet cancel-tx <txHash>
```

### Register Sender

Registers a sender's address in the wallet, so the note synching process will look for notes sent by them. This is required to be able to receive on-chain encrypted notes from a sender.

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080")
- `-f, --from <string>`: Alias or address of the account to simulate from
- `-a, --alias <string>`: Alias for the sender. Used for easy reference in subsequent commands.

#### Example

```bash
aztec-wallet register-sender <address> -a <alias>
```

### Create Secret

Creates an aliased secret to use in other commands.

#### Options

- `-a, --alias <string>`: Key to alias the secret with

#### Example

```bash
aztec-wallet create-secret -a <alias>
```

