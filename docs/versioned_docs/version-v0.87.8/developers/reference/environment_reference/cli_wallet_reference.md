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

import { Why_Fees, CLI_Fees } from '@site/src/components/Snippets/general_snippets';

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

```bash title="import-test-accounts" showLineNumbers 
aztec-wallet import-test-accounts
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/cli-wallet/test/flows/basic.sh#L9-L11" target="_blank" rel="noopener noreferrer">Source code: yarn-project/cli-wallet/test/flows/basic.sh#L9-L11</a></sub></sup>


Then use the alias (test0, test1...) when paying in fee juice. Eg to create accounts:

```bash title="declare-accounts" showLineNumbers 
aztec-wallet create-account -a alice --payment method=fee_juice,feePayer=test0
aztec-wallet create-account -a bob --payment method=fee_juice,feePayer=test0
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/end-to-end/src/guides/up_quick_start.sh#L21-L24" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/up_quick_start.sh#L21-L24</a></sub></sup>


### Mint and Bridge Fee Juice

#### On Sandbox

First register an account, mint the fee asset on L1 and bridge it to fee juice:

```bash title="bridge-fee-juice" showLineNumbers 
aztec-wallet create-account -a main --register-only
aztec-wallet bridge-fee-juice 1000000000000000000 main --mint --no-wait
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/cli-wallet/test/flows/create_account_pay_native.sh#L8-L11" target="_blank" rel="noopener noreferrer">Source code: yarn-project/cli-wallet/test/flows/create_account_pay_native.sh#L8-L11</a></sub></sup>


You'll have to wait for two blocks to pass for bridged fee juice to be ready on Aztec.
For the sandbox you do this by putting through two arbitrary transactions. Eg:

<!-- This is hard coded because the 'aztec-wallet deploy Counter' command is different in the test file -->

```bash title="force-two-blocks" showLineNumbers
aztec-wallet import-test-accounts # if you haven't already imported the test accounts
aztec-wallet deploy Counter --init initialize --args 0 accounts:test0 -f test0 -a counter
aztec-wallet send increment -ca counter --args accounts:test0 accounts:test0 -f test0
```

Now the funded account can deploy itself with the bridged fees, claiming the bridged fee juice and deploying the contract in one transaction:

```bash title="claim-deploy-account" showLineNumbers 
aztec-wallet deploy-account -f main --payment method=fee_juice,claim
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/cli-wallet/test/flows/create_account_pay_native.sh#L25-L27" target="_blank" rel="noopener noreferrer">Source code: yarn-project/cli-wallet/test/flows/create_account_pay_native.sh#L25-L27</a></sub></sup>


#### Minting on Testnet

This will mint the specified amount of fee juice on L1 and bridge it to L2.

```bash
aztec-wallet bridge-fee-juice <amount> <AztecAddress> -n <aztec_node_url> --mint --l1-rpc-urls <rpc_url_s> --l1-private-key <pkey> --l1-chain-id 11155111 # sepolia
```

## Connect to the Testnet

To connect to the testnet, pass the `AZTEC_NODE_URL` to the wallet with the `--node-url` (`-n`) option.

```bash
export AZTEC_NODE_URL=<testnet-ip-address>
export SPONSORED_FPC_ADDRESS=0x1260a43ecf03e985727affbbe3e483e60b836ea821b6305bea1c53398b986047
# Register a new account
aztec-wallet create-account --register-only -a main -n $AZTEC_NODE_URL
aztec-wallet register-contract $SPONSORED_FPC_ADDRESS SponsoredFPC --from main -n $AZTEC_NODE_URL --salt 0 -a sponsoredfpc
aztec-wallet create-account -n $AZTEC_NODE_URL --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS
```

## Payment Options

Many commands support payment options for transaction fees:

```bash
--payment method=<name>,feePayer=<address>,asset=<address>,fpc=<address>,claim=<bool>,claimSecret=<string>,claimAmount=<number>,messageLeafIndex=<number>,feeRecipient=<address>
```

Valid payment methods:

- `fee_juice`: Pay with fee juice (default)
- `fpc-public`: Pay with a public FPC
- `fpc-private`: Pay with a private FPC
- `fpc-sponsored`: Pay with a sponsored FPC

## Gas Options

Commands that send transactions support gas-related options:

```bash
--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>
--max-fees-per-gas <da=100,l2=100>
--max-priority-fees-per-gas <da=0,l2=0>
--no-estimate-gas
--estimate-gas-only
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

#### Testnet Example

```bash
aztec-wallet create-account --register-only -a main -n $AZTEC_NODE_URL
aztec-wallet register-contract $SPONSORED_FPC_ADDRESS SponsoredFPC --from main -n $AZTEC_NODE_URL --salt 0 -a sponsoredfpc
aztec-wallet create-account -n $AZTEC_NODE_URL --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS
```

### Deploy account

Deploys an already registered aztec account that can be used for sending transactions.

```bash
aztec-wallet deploy-account [options]
```

#### Options

- `-f, --from <string>`: Alias or address of the account to deploy
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `--json`: Emit output as json
- `--no-wait`: Skip waiting for the contract to be deployed. Print the hash of deployment transaction
- `--register-class`: Register the contract class (useful for when the contract class has not been deployed yet)
- `--payment <options>`: Fee payment method and arguments
  - Parameters:
    - `method`: Valid values: "fee_juice", "fpc-public", "fpc-private", "fpc-sponsored" (Default: fee_juice)
    - `feePayer`: The account paying the fee
    - `asset`: The asset used for fee payment (Required for "fpc-public" and "fpc-private")
    - `fpc`: The FPC contract that pays in fee juice (Not required for the "fee_juice" method)
    - `claim`: Whether to use a previously stored claim to bridge fee juice
    - `claimSecret`: The secret to claim fee juice on L1
    - `claimAmount`: The amount of fee juice to be claimed
    - `messageLeafIndex`: The index of the claim in the l1toL2Message tree
    - `feeRecipient`: Recipient of the fee
  - Format: `--payment method=name,feePayer=address,asset=address ...`
- `--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>`: Gas limits for the tx
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation
- `--max-priority-fees-per-gas <da=0,l2=0>`: Maximum priority fees per gas unit for DA and L2 computation
- `--no-estimate-gas`: Whether to automatically estimate gas limits for the tx
- `--estimate-gas-only`: Only report gas estimation for the tx, do not send it

#### Example

```bash
$ aztec-wallet create-account --register-only -a master_yoda
...
$ aztec-wallet deploy-account -f master_yoda
```

When you are deploying an account on testnet, you need to either bridge fee juice or pay for the account deployment with an FPC to pay for the deployment. When using an FPC, you need to create an account, regsiter the FPC, and then you can use it. For example:

```bash
aztec-wallet create-account --register-only -a main -n $AZTEC_NODE_URL
aztec-wallet register-contract $SPONSORED_FPC_ADDRESS SponsoredFPC --from main -n $AZTEC_NODE_URL --salt 0 -a sponsoredfpc
aztec-wallet deploy-account -n $AZTEC_NODE_URL --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS
```

## Contracts Actions

### Deploy Contract

Deploys a compiled Aztec.nr contract to Aztec.

```bash
aztec-wallet deploy [options] [artifact]
```

#### Arguments

- `artifact`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract

#### Options

- `--init <string>`: The contract initializer function to call (default: "constructor")
- `--no-init`: Leave the contract uninitialized
- `-k, --public-key <string>`: Optional encryption public key for this address. Set this value only if this contract is expected to receive private notes, which will be encrypted using this public key
- `-s, --salt <hex string>`: Optional deployment salt as a hex string for generating the deployment address
- `--universal`: Do not mix the sender address into the deployment
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `--args [args...]`: Constructor arguments (default: [])
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-f, --from <string>`: Alias or address of the account to deploy from
- `-a, --alias <string>`: Alias for the contract. Used for easy reference subsequent commands
- `--json`: Emit output as json
- `--no-wait`: Skip waiting for the contract to be deployed. Print the hash of deployment transaction
- `--no-class-registration`: Don't register this contract class
- `--no-public-deployment`: Don't emit this contract's public bytecode
- `--payment <options>`: Fee payment method and arguments
  - Parameters:
    - `method`: Valid values: "fee_juice", "fpc-public", "fpc-private", "fpc-sponsored" (Default: fee_juice)
    - `asset`: The asset used for fee payment (Required for "fpc-public" and "fpc-private")
    - `fpc`: The FPC contract that pays in fee juice (Not required for the "fee_juice" method)
    - `claim`: Whether to use a previously stored claim to bridge fee juice
    - `claimSecret`: The secret to claim fee juice on L1
    - `claimAmount`: The amount of fee juice to be claimed
    - `messageLeafIndex`: The index of the claim in the l1toL2Message tree
    - `feeRecipient`: Recipient of the fee
  - Format: `--payment method=name,asset=address,fpc=address ...`
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

```bash
aztec-wallet register-contract [options] [address] [artifact]
```

#### Arguments

- `address`: The address of the contract to register
- `artifact`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract

#### Options

- `--init <string>`: The contract initializer function to call (default: "constructor")
- `-k, --public-key <string>`: Optional encryption public key for this address. Set this value only if this contract is expected to receive private notes, which will be encrypted using this public key
- `-s, --salt <hex string>`: Optional deployment salt as a hex string for generating the deployment address
  Sends a transaction by calling a function on an Aztec contract.
- `--args [args...]`: Constructor arguments (default: [])
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `-f, --from <string>`: Alias or address of the account to simulate from
- `-a, --alias <string>`: Alias for the contact. Used for easy reference in subsequent commands

#### Example

```bash
aztec-wallet register-contract <address> <artifact> -a <alias>
```

### Send Transaction

Sends a transaction by calling a function on an Aztec contract.

```bash
aztec-wallet send [options] <functionName>
```

#### Arguments

- `functionName`: Name of function to execute

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `--args [args...]`: Function arguments (default: [])
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract
- `-ca, --contract-address <address>`: Aztec address of the contract
- `-a, --alias <string>`: Alias for the transaction hash. Used for easy reference in subsequent commands
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-aw, --auth-witness <string,...>`: Authorization witness to use for the transaction. If using multiple, pass a comma separated string
- `-f, --from <string>`: Alias or address of the account to send the transaction from
- `--no-wait`: Print transaction hash without waiting for it to be mined
- `--no-cancel`: Do not allow the transaction to be cancelled. This makes for cheaper transactions
- `--payment <options>`: Fee payment method and arguments
  - Parameters:
    - `method`: Valid values: "fee_juice", "fpc-public", "fpc-private", "fpc-sponsored" (Default: fee_juice)
    - `asset`: The asset used for fee payment (Required for "fpc-public" and "fpc-private")
    - `fpc`: The FPC contract that pays in fee juice (Not required for the "fee_juice" method)
    - `claim`: Whether to use a previously stored claim to bridge fee juice
    - `claimSecret`: The secret to claim fee juice on L1
    - `claimAmount`: The amount of fee juice to be claimed
    - `messageLeafIndex`: The index of the claim in the l1toL2Message tree
    - `feeRecipient`: Recipient of the fee
  - Format: `--payment method=name,asset=address,fpc=address ...`
- `--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>`: Gas limits for the tx
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation
- `--max-priority-fees-per-gas <da=0,l2=0>`: Maximum priority fees per gas unit for DA and L2 computation
- `--no-estimate-gas`: Whether to automatically estimate gas limits for the tx
- `--estimate-gas-only`: Only report gas estimation for the tx, do not send it

#### Example

```bash
aztec-wallet send --from master_yoda --contract-address jedi_order --args "luke skywalker" train_jedi
```

:::note

On testnet, you might sometimes see a `transaction failed: timeout error`. This is not an actual failure - your transaction has been sent to the mempool and it is just timed out waiting to be mined. You can use `aztec-wallet get-tx <txhash>` to check status.

:::

### Simulate Transaction

Simulates the execution of a function on an Aztec contract.

```bash
aztec-wallet simulate [options] <functionName>
```

#### Arguments

- `functionName`: Name of function to simulate

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `--args [args...]`: Function arguments (default: [])
- `-ca, --contract-address <address>`: Aztec address of the contract
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-aw, --auth-witness <string,...>`: Authorization witness to use for the simulation
- `-f, --from <string>`: Alias or address of the account to simulate from

#### Example

```bash
aztec-wallet simulate --from master_yoda --contract-address jedi_order --args "luke_skywalker" train_jedi
```

### Profile Transaction

Profiles a private function by counting the unconditional operations in its execution steps.

```bash
aztec-wallet profile [options] <functionName>
```

#### Arguments

- `functionName`: Name of function to simulate

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `--args [args...]`: Function arguments (default: [])
- `-ca, --contract-address <address>`: Aztec address of the contract
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract
- `--debug-execution-steps-dir <address>`: Directory to write execution step artifacts for bb profiling/debugging
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-aw, --auth-witness <string,...>`: Authorization witness to use for the simulation
- `-f, --from <string>`: Alias or address of the account to simulate from

#### Example

```bash
aztec-wallet profile --from master_yoda --contract-address jedi_order --args "luke_skywalker" train_jedi
```

### Create AuthWit

Creates an authorization witness that can be privately sent to a caller so they can perform an action on behalf of the provided account.

```bash
aztec-wallet create-authwit [options] <functionName> <caller>
```

#### Arguments

- `functionName`: Name of function to authorize
- `caller`: Account to be authorized to perform the action

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `--args [args...]`: Function arguments (default: [])
- `-ca, --contract-address <address>`: Aztec address of the contract
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-f, --from <string>`: Alias or address of the account to simulate from
- `-a, --alias <string>`: Alias for the authorization witness. Used for easy reference in subsequent commands

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

Authorizes a public call on the caller, so they can perform an action on behalf of the provided account.

```bash
aztec-wallet authorize-action [options] <functionName> <caller>
```

#### Arguments

- `functionName`: Name of function to authorize
- `caller`: Account to be authorized to perform the action

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `--args [args...]`: Function arguments (default: [])
- `-ca, --contract-address <address>`: Aztec address of the contract
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-f, --from <string>`: Alias or address of the account to simulate from

#### Public AuthWit Example

A similar call to the above, but in public:

```bash
aztec-wallet authorize-action transfer_in_public accounts:coruscant_trader -ca contracts:token --args accounts:jedi_master accounts:coruscant_trader 20 secrets:auth_nonce -f accounts:jedi_master
```

### Bridge Fee Juice

Mints L1 Fee Juice and pushes them to L2.

The wallet provides an easy way to mint the fee-paying asset on L1 and
bridging it to L2. Current placeholder-name "fee juice".

Using the sandbox, there's already a Fee Juice contract that manages this
enshrined asset. You can optionally mint more Juice before bridging it.

```bash
aztec-wallet bridge-fee-juice [options] <amount> <recipient>
```

#### Arguments

- `amount`: The amount of Fee Juice to mint and bridge
- `recipient`: Aztec address of the recipient

#### Options

- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"])
- `-m, --mnemonic <string>`: The mnemonic to use for deriving the Ethereum address that will mint and bridge (default: "test test test test test test test test test test test junk")
- `--mint`: Mint the tokens on L1 (default: false)
- `--l1-private-key <string>`: The private key to the eth account bridging
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: `L1_CHAIN_ID`)
- `--json`: Output the claim in JSON format
- `--no-wait`: Wait for the bridged funds to be available in L2, polling every 60 seconds
- `--interval <number>`: The polling interval in seconds for the bridged funds (default: "60")

#### Example

This simple sandbox example mints an amount of fee juice and bridges it to the `master_yoda` recipient on L2. For testnet, you will need to specify relevant L1 options listed above.

```bash
aztec-wallet bridge-fee-juice --mint <amount> master_yoda
```

### Get Transaction

Gets the status of the recent txs, or a detailed view if a specific transaction hash is provided.

```bash
aztec-wallet get-tx [options] [txHash]
```

#### Arguments

- `txHash`: A transaction hash to get the receipt for

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `-p, --page <number>`: The page number to display (default: 1)
- `-s, --page-size <number>`: The number of transactions to display per page (default: 10)

#### Example

```bash
# Get status of recent transactions
aztec-wallet get-tx

# Get detailed view of a specific transaction
aztec-wallet get-tx <txHash>
```

### Cancel Transaction

Cancels a pending tx by reusing its nonce with a higher fee and an empty payload.

```bash
aztec-wallet cancel-tx [options] <txHash>
```

#### Arguments

- `txHash`: A transaction hash to cancel

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `-sk, --secret-key <string>`: The sender's secret key (env: `SECRET_KEY`)
- `-f, --from <string>`: Alias or address of the account to simulate from
- `--payment <options>`: Fee payment method and arguments
  - Parameters:
    - `method`: Valid values: "fee_juice", "fpc-public", "fpc-private", "fpc-sponsored" (Default: fee_juice)
    - `asset`: The asset used for fee payment (Required for "fpc-public" and "fpc-private")
    - `fpc`: The FPC contract that pays in fee juice (Not required for the "fee_juice" method)
    - `claim`: Whether to use a previously stored claim to bridge fee juice
    - `claimSecret`: The secret to claim fee juice on L1
    - `claimAmount`: The amount of fee juice to be claimed
    - `messageLeafIndex`: The index of the claim in the l1toL2Message tree
    - `feeRecipient`: Recipient of the fee
  - Format: `--payment method=name,asset=address,fpc=address ...` (default: "method=fee_juice")
- `-i, --increased-fees [da=1,l2=1]`: The amounts by which the fees are increased (default: "feePerDaGas":"0x0000000000000000000000000000000000000000000000000000000000000001","feePerL2Gas":"0x0000000000000000000000000000000000000000000000000000000000000001")
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation

#### Example

```bash
aztec-wallet cancel-tx <txHash>
```

### Register Sender

Registers a sender's address in the wallet, so the note syncing process will look for notes sent by them.

```bash
aztec-wallet register-sender [options] [address]
```

#### Arguments

- `address`: The address of the sender to register

#### Options

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: `PXE_URL`)
- `-f, --from <string>`: Alias or address of the account to simulate from
- `-a, --alias <string>`: Alias for the sender. Used for easy reference in subsequent commands

#### Example

```bash
aztec-wallet register-sender <address> -a <alias>
```

### Create Secret

Creates an aliased secret to use in other commands.

```bash
aztec-wallet create-secret [options]
```

#### Options

- `-a, --alias <string>`: Key to alias the secret with

#### Example

```bash
aztec-wallet create-secret -a <alias>
```
