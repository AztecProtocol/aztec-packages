---
title: "NFT contract"
sidebar_position: 5
---

In this tutorial we will go through writing an L2 native NFT token contract
for the Aztec Network, using the Aztec.nr contract libraries.

This tutorial is intended to help you get familiar with the Aztec.nr library, Aztec contract syntax and some of the underlying structure of the Aztec network.

In this tutorial you will learn how to:

- Write public functions that update public state
- Write private functions that update private state
- Implement access control on public and private functions
- Handle math operations safely
- Handle different private note types
- Pass data between private and public state

We are going to start with a blank project and fill in the token contract source code defined [here (GitHub Link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-contracts/contracts/nft_contract/src/main.nr), and explain what is being added as we go.

## Requirements

You will need to have `aztec-nargo` installed in order to compile Aztec.nr contracts.

## Project setup

Create a new project with:

```bash
aztec-nargo new --contract nft_contract
```

Your file structure should look something like this:

```tree
.
|--nft_contract
|  |--src
|  |  |--main.nr
|  |--Nargo.toml
```

Inside `Nargo.toml` paste the following:

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/aztec" }
authwit={ git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/authwit"}
compressed_string = {git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/compressed-string"}
```

We will be working within `main.nr` for the rest of the tutorial.

### Execution contexts

Before we go further, a quick note about execution contexts.

Transactions are initiated in the private context (executed client-side), then move to the L2 public context (executed remotely by an Aztec sequencer), then to the Ethereum L1 context (executed by an Ethereum node).

Step 1. Private Execution

Users provide inputs and execute locally on their device for privacy reasons. Outputs of the private execution are commitment and nullifier updates, a proof of correct execution and any return data to pass to the public execution context.

Step 2. Public Execution

This happens remotely by the sequencer, which takes inputs from the private execution and runs the public code in the network virtual machine, similar to any other public blockchain.

Step 3. Ethereum execution

Aztec transactions can pass messages to Ethereum contracts through the rollup via the outbox. The data can be consumed by Ethereum contracts at a later time, but this is not part of the transaction flow for an Aztec transaction. The technical details of this are beyond the scope of this tutorial, but we will cover them in an upcoming piece.

## How this will work

Before writing the functions, let's go through them to see how this contract will work:

### Initializer

There is one `initializer` function in this contract, and it will be selected and executed once when the contract is deployed, similar to a constructor in Solidity. This is marked `public`, so the function logic will be transparent.

### Public functions

These are functions that have transparent logic, will execute in a publicly verifiable context and can update public storage.

- [`constructor`](#constructor) - executed when the contract instance is deployed
- [`set_admin`](#set_admin) - updates the `admin` of the contract
- [`set_minter`](#set_minter) - adds a minter to the `minters` mapping
- [`mint`](#mint) - mints an NFT with a specified `token_id` to the recipient
- [`transfer_in_public`](#transfer_in_public) - publicly transfer the specified token
- [`finalize_transfer_to_private`](#finalize_transfer_to_private) - finalized a transfer to from the public context to the private context (more on this below)

#### Public `view` functions

These functions are useful for getting contract information for use in other contracts, in the public context.

- [`public_get_name`](#public_get_name) - returns name of the NFT contract
- [`public_get_symbol`](#public_get_symbol) - returns the symbols of the NFT contract
- [`get_admin`](#get_admin) - returns the `admin` account address
- [`is_minter`](#is_minter) - returns a boolean, indicating whether the provided address is a minter
- [`owner_of`](#owner_of) - returns the owner of the provided `token_id`

### Private functions

These are functions that have private logic and will be executed on user devices to maintain privacy. The only data that is submitted to the network is a proof of correct execution, new data commitments and nullifiers, so users will not reveal which contract they are interacting with or which function they are executing. The only information that will be revealed publicly is that someone executed a private transaction on Aztec.

- [`transfer_to_private`](#transfer_to_private) - initiates the transfer of an NFT from the public context to the private context
- [`prepare_private_balance_increase`](#prepare_private_balance_increase) - creates a [partial note](../../../aztec/concepts/storage/partial_notes.md) to transfer an NFT from the public context to the private context.
- [`cancel_authwit`](#cancel_authwit) - emits a nullifier to cancel a private authwit
- [`transfer_in_private`](#transfer_in_private) - transfers an NFT to another account, privately
- [`transfer_to_public`](#transfer_to_public) - transfers and NFT from a private accounts' balance to a specified accounts' public balance

#### Private `view` functions

These functions are useful for getting contract information in another contract in the private context.

- [`private_get_symbol`](#private_get_symbol) - returns the NFT contract symbol
- [`private_get_name`](#private_get_name) - returns the NFT contract name

### Internal functions

Internal functions are functions that can only be called by the contract itself. These can be used when the contract needs to call one of it's public functions from one of it's private functions.

- [`_store_payload_in_transient_storage_unsafe`](#_store_payload_in_transient_storage_unsafe) - a public function that is called when preparing a private balance increase. This function handles the needed public state updates.
- [`finalize_transfer_to_private_unsafe`](#_finalize_transfer_to_private_unsafe) - finalizes a transfer from public to private state

### Unconstrained functions

Unconstrained functions can be thought of as view functions from Solidity--they only return information from the contract storage or compute and return data without modifying contract storage. They are distinguished from functions with the `#[view]` annotation in that unconstrained functions cannot be called by other contracts.

- [`get_private_nfts`](#get_private_nfts) - Returns an array of token IDs owned by the passed `AztecAddress` in private and a flag indicating whether a page limit was reached.

## Contract dependencies

Before we can implement the functions, we need set up the contract storage, and before we do that we need to import the appropriate dependencies.

:::info Copy required files

We will be going over the code in `main.nr` [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/token_contract/src). If you are following along and want to compile `main.nr` yourself, you need to add the other files in the directory as they contain imports that are used in `main.nr`.

:::

Paste these imports:

```rust
#include_code imports /noir-projects/noir-contracts/contracts/nft_contract/src/main.nr raw
}
```

We are importing:

- `CompressedString` to hold the token symbol
- Types from `aztec::prelude`
- Types for storing note types

### Types files

We are also importing types from a `types.nr` file, which imports types from the `types` folder. You can view them [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/nft_contract/src).

:::note

Private state in Aztec is all [UTXOs](../../../aztec/concepts/storage/index.md).

:::

## Contract Storage

Now that we have dependencies imported into our contract we can define the storage for the contract.

Below the dependencies, paste the following Storage struct:

#include_code storage_struct /noir-projects/noir-contracts/contracts/nft_contract/src/main.nr rust

## Custom Notes

The contract storage uses a [custom note](../../../guides/developer_guides/smart_contracts/writing_contracts/notes/custom_note.md) implementation. Custom notes are useful for defining your own data types. You can think of a custom note as a "chunk" of private data, the entire thing is added, updated or nullified (deleted) together. This NFT note is very simple and stores only the owner and the `token_id` and uses `randomness` to hide its contents.

Randomness is required because notes are stored as commitments (hashes) in the note hash tree. Without randomness, the contents of a note may be derived through brute force (e.g. without randomness, if you know my Aztec address, you may be able to figure out which note hash in the tree is mine by hashing my address with many potential `token_id`s).

#include_code nft_note /noir-projects/noir-contracts/contracts/nft_contract/src/types/nft_note.nr rust

The custom note implementation also includes the nullifier computation function. This tells the protocol how the note should be nullified.

#include_code compute_nullifier /noir-projects/noir-contracts/contracts/nft_contract/src/types/nft_note.nr rust

## Functions

Copy and paste the body of each function into the appropriate place in your project if you are following along.

### Constructor

This function sets the admin and makes them a minter, and sets the name and symbol.

#include_code constructor /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

### Public function implementations

Public functions are declared with the `#[public]` macro above the function name.

As described in the [execution contexts section above](#execution-contexts), public function logic and transaction information is transparent to the world. Public functions update public state, but can be used to finalize notes prepared in a private context ([partial notes flow](../../../aztec/concepts/storage/partial_notes.md)).

Storage is referenced as `storage.variable`.

#### `set_admin`

The function checks that the `msg_sender` is the `admin`. If not, the transaction will fail. If it is, the `new_admin` is saved as the `admin`.

#include_code set_admin /noir-projects/noir-contracts/contracts/nft_contract/src/main.nr rust

#### `set_minter`

This function allows the `admin` to add or a remove a `minter` from the public `minters` mapping. It checks that `msg_sender` is the `admin` and finally adds the `minter` to the `minters` mapping.

#include_code set_minter /noir-projects/noir-contracts/contracts/nft_contract/src/main.nr rust

#### `mint`

This public function checks that the `token_id` is not 0 and does not already exist and the `msg_sender` is authorized to mint. Then it indicates that the `token_id` exists, which is useful for verifying its existence if it gets transferred to private, and updates the owner in the `public_owners` mapping.

#include_code mint /noir-projects/noir-contracts/contracts/nft_contract/src/main.nr rust

#### `transfer_in_public`

#include_code transfer_in_public /noir-projects/noir-contracts/contracts/nft_contract/src/main.nr rust

##### Authorizing token spends

If the `msg_sender` is **NOT** the same as the account to debit from, the function checks that the account has authorized the `msg_sender` contract to debit tokens on its behalf. This check is done by computing the function selector that needs to be authorized, computing the hash of the message that the account contract has approved. This is a hash of the contract that is approved to spend (`context.msg_sender`), the token contract that can be spent from (`context.this_address()`), the `selector`, the account to spend from (`from`), the `amount` and a `nonce` to prevent multiple spends. This hash is passed to `assert_inner_hash_valid_authwit_public` to ensure that the Account Contract has approved tokens to be spent on it's behalf.

If the `msg_sender` is the same as the account to debit from, the authorization check is bypassed and the function proceeds to update the public owner.

#### `finalize_transfer_to_private`

This public function finalizes a transfer that has been set up by a call to `prepare_private_balance_increase` by reducing the public balance of the associated account and emitting the note for the intended recipient.

#include_code finalize_transfer_to_private /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

### Private function implementations

Private functions are declared with the `#[private]` macro above the function name like so:

```rust
    #[private]
    fn transfer_in_private(
```

As described in the [execution contexts section above](#execution-contexts), private function logic and transaction information is hidden from the world and is executed on user devices. Private functions update private state, but can pass data to the public execution context (e.g. see the [`transfer_to_public`](#transfer_to_public) function).

Storage is referenced as `storage.variable`.

#### `transfer_to_private`

Transfers token with `token_id` from public balance of the sender to a private balance of `to`. Calls [`_prepare_private_balance_increase`](#prepare_private_balance_increase) to get the hiding point slot and [`_finalize_transfer_to_private_unsafe`](#_finalize_transfer_to_private_unsafe) to finalize the transfer in the public context.

#include_code transfer_to_private /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `prepare_private_balance_increase`

TODO

#### `cancel_authwit`

TODO

#### `transfer_in_private`

TODO

#### `transfer_to_public`

TODO

### Internal function implementations

Internal functions are functions that can only be called by this contract. The following 3 functions are public functions that are called from the [private execution context](#execution-contexts). Marking these as `internal` ensures that only the desired private functions in this contract are able to call them. Private functions defer execution to public functions because private functions cannot update public state directly.

#### `_store_payload_in_transient_storage_unsafe`

It is labeled unsafe because the public function does not check the value of the storage slot before writing, but it is safe because of the private execution preceding this call.

#include_code \_store_payload_in_transient_storage_unsafe /noir-projects/noir-contracts/contracts/nft_contract/src/main.nr rust

#### `_finalize_transfer_to_private_unsafe`

This function is labeled as unsafe because the sender is not enforced in this function, but it is safe because the sender is enforced in the execution of the private function that calls this function.

#include_code \_finalize_transfer_to_private_unsafe /noir-projects/noir-contracts/contracts/nft_contract/src/main.nr rust

#### `_finish_transfer_to_public`

Updates the public owner of the `token_id` to the `to` address.

#include_code \_finish_transfer_to_public /noir-projects/noir-contracts/contracts/nft_contract/src/main.nr rust

### View function implementations

View functions in Aztec are similar to `view` functions in Solidity in that they only return information from the contract storage or compute and return data without modifying contract storage. These functions are different from unconstrained functions in that the return values are constrained by their definition in the contract.

Public view calls that are part of a transaction will be executed by the sequencer when the transaction is being executed, so they are not private and will reveal information about the transaction. Private view calls can be safely used in private transactions for getting the same information.

#### `get_admin`

A getter function for reading the public `admin` value.

#include_code admin /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `is_minter`

A getter function for checking the value of associated with a `minter` in the public `minters` mapping.

#include_code is_minter /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### `owner_of`

Returns the owner of the provided `token_id`. Reverts if the `token_id` does not exist. Returns the zero address if the `token_id` does not have a public owner.

#### `public_get_name`

Returns the name of the NFT contract in the public context.

#### `public_get_symbol`

Returns the symbol of the NFT contract in the public context.

#### `private_get_name`

Returns the name of the NFT contract in the private context.

#### `private_get_symbol`

Returns the symbol of the NFT contract in the private context.

### Unconstrained function implementations

Unconstrained functions are similar to `view` functions in Solidity in that they only return information from the contract storage or compute and return data without modifying contract storage. They are different from view functions in that the values are returned from the user's PXE and are not constrained by the contract's definition--if there is bad data in the user's PXE, they will get bad data back.

#### `get_private_nfts`

A getter function for checking the private balance of the provided Aztec account. Returns an array of token IDs owned by `owner` in private and a flag indicating whether a page limit was reached.

#include_code get_private_nfts /noir-projects/noir-contracts/contracts/nft_contract/src/main.nr rust

## Compiling

Now that the contract is complete, you can compile it with `aztec-nargo`. See the [Sandbox reference page](../../../reference/developer_references/sandbox_reference/index.md) for instructions on setting it up.

Run the following command in the directory where your `Nargo.toml` file is located:

```bash
aztec-nargo compile
```

Once your contract is compiled, optionally generate a typescript interface with the following command:

```bash
aztec codegen target -o src/artifacts
```

### Optional: Dive deeper into this contract and concepts mentioned here

- Review [the end to end tests (Github link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/end-to-end/src/e2e_nft.test.ts) for reference.
- [Nullifiers](../../../aztec/concepts/storage/trees/index.md#nullifier-tree)
- [Public / Private function calls](../../../aztec/smart_contracts/functions/public_private_calls.md).
- [Contract Storage](../../../aztec/concepts/storage/index.md)
- [Authwit](../../../aztec/concepts/accounts/authwit.md)
