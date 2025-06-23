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

This tutorial is compatible with the Aztec version `v1.0.0-staging.0`. Install the correct version with `aztec-up -v 1.0.0-staging.0`. Or if you'd like to use a different version, you can find the relevant tutorial by clicking the version dropdown at the top of the page.

We are going to start with a blank project and fill in the token contract source code defined [here (GitHub Link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr), and explain what is being added as we go.

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
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0-staging.0", directory="noir-projects/aztec-nr/aztec" }
authwit={ git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0-staging.0", directory="noir-projects/aztec-nr/authwit"}
compressed_string = {git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0-staging.0", directory="noir-projects/aztec-nr/compressed-string"}
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
- [`finalize_transfer_to_private`](#finalize_transfer_to_private) - finalize the transfer of the NFT from public to private context by completing the [partial note](../../../../aztec/concepts/advanced/storage/partial_notes.md)(more on this below)

#### Public `view` functions

These functions are useful for getting contract information for use in other contracts, in the public context.

- [`public_get_name`](#public_get_name) - returns name of the NFT contract
- [`public_get_symbol`](#public_get_symbol) - returns the symbols of the NFT contract
- [`get_admin`](#get_admin) - returns the `admin` account address
- [`is_minter`](#is_minter) - returns a boolean, indicating whether the provided address is a minter
- [`owner_of`](#owner_of) - returns the owner of the provided `token_id`

### Private functions

These are functions that have private logic and will be executed on user devices to maintain privacy. The only data that is submitted to the network is a proof of correct execution, new data commitments and nullifiers, so users will not reveal which contract they are interacting with or which function they are executing. The only information that will be revealed publicly is that someone executed a private transaction on Aztec.

- [`transfer_to_private`](#transfer_to_private) - privately initiates the transfer of an NFT from the public context to the private context by creating a [partial note](../../../../aztec/concepts/advanced/storage/partial_notes.md)
- [`prepare_private_balance_increase`](#prepare_private_balance_increase) - creates a [partial note](../../../../aztec/concepts/advanced/storage/partial_notes.md) to transfer an NFT from the public context to the private context.
- [`cancel_authwit`](#cancel_authwit) - emits a nullifier to cancel a private authwit
- [`transfer_in_private`](#transfer_in_private) - transfers an NFT to another account, privately
- [`transfer_to_public`](#transfer_to_public) - transfers a NFT from private to public context

#### Private `view` functions

These functions are useful for getting contract information in another contract in the private context.

- [`private_get_symbol`](#private_get_symbol) - returns the NFT contract symbol
- [`private_get_name`](#private_get_name) - returns the NFT contract name

### Internal functions

Internal functions are functions that can only be called by the contract itself. These can be used when the contract needs to call one of it's public functions from one of it's private functions.

- [`finalize_transfer_to_private_unsafe`](#_finalize_transfer_to_private_unsafe) - finalizes a transfer from public to private state

### Utility functions

The contract contains a single [utility function](../../../../aztec/smart_contracts/functions/attributes.md#utility-functions-utility):

- [`get_private_nfts`](#get_private_nfts) - Returns an array of token IDs owned by the passed `AztecAddress` in private and a flag indicating whether a page limit was reached.

## Contract dependencies

Before we can implement the functions, we need set up the contract storage, and before we do that we need to import the appropriate dependencies.

:::info Copy required files

We will be going over the code in `main.nr` [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src). If you are following along and want to compile `main.nr` yourself, you need to add the other files in the directory as they contain imports that are used in `main.nr`.

:::

Paste these imports:

```rust
mod types;
mod test;

use aztec::macros::aztec;

// Minimal NFT implementation with `AuthWit` support that allows minting in public-only and transfers in both public
// and private.
#[aztec]
pub contract NFT {
    use crate::types::nft_note::{NFTNote, PartialNFTNote};
    use authwit::auth::{
        assert_current_call_valid_authwit, assert_current_call_valid_authwit_public,
        compute_authwit_nullifier,
    };
    use aztec::{
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility, view},
            storage::storage,
        },
        messages::logs::note::encode_and_encrypt_note,
        note::{constants::MAX_NOTES_PER_PAGE, note_interface::NoteProperties},
        prelude::{
            AztecAddress, Map, NoteGetterOptions, NoteViewerOptions, PrivateContext, PrivateSet,
            PublicContext, PublicImmutable, PublicMutable,
        },
        protocol_types::traits::ToField,
        utils::comparison::Comparator,
    };
    use compressed_string::FieldCompressedString;
}
```

We are importing:

- `CompressedString` to hold the token symbol
- Types from `aztec::prelude`
- Types for storing note types

### Types files

We are also importing types from a `types.nr` file, which imports types from the `types` folder. You can view them [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src).

:::note

Private state in Aztec is all [UTXOs](../../../../aztec/concepts/storage/state_model.md).

:::

## Contract Storage

Now that we have dependencies imported into our contract we can define the storage for the contract.

Below the dependencies, paste the following Storage struct:

```rust title="storage_struct" showLineNumbers 
#[storage]
struct Storage<Context> {
    // The symbol of the NFT
    symbol: PublicImmutable<FieldCompressedString, Context>,
    // The name of the NFT
    name: PublicImmutable<FieldCompressedString, Context>,
    // The admin of the contract
    admin: PublicMutable<AztecAddress, Context>,
    // Addresses that can mint
    minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
    // Contains the NFTs owned by each address in private.
    private_nfts: Map<AztecAddress, PrivateSet<NFTNote, Context>, Context>,
    // A map from token ID to a boolean indicating if the NFT exists.
    nft_exists: Map<Field, PublicMutable<bool, Context>, Context>,
    // A map from token ID to the public owner of the NFT.
    public_owners: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L44-L62" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L44-L62</a></sub></sup>


## Custom Notes

The contract storage uses a [custom note](../../../guides/smart_contracts/writing_contracts/notes/implementing_a_note.md) implementation. Custom notes are useful for defining your own data types. You can think of a custom note as a "chunk" of private data, the entire thing is added, updated or nullified (deleted) together. This NFT note is very simple and stores only the owner and the `token_id` and uses `randomness` to hide its contents.

Randomness is required because notes are stored as commitments (hashes) in the note hash tree. Without randomness, the contents of a note may be derived through brute force (e.g. without randomness, if you know my Aztec address, you may be able to figure out which note hash in the tree is mine by hashing my address with many potential `token_id`s).

```rust title="nft_note" showLineNumbers 
/// A private note representing a token id associated to an account.
#[custom_note]
#[derive(Eq, Serialize)]
pub struct NFTNote {
    // The ordering of these fields is important given that it must:
    //   a) match that of NFTPartialNotePrivateContent, and
    //   b) have the public field at the end
    // Correct ordering is checked by the tests in this module.

    /// The owner of the note, i.e. the account whose nullifier secret key is required to compute the nullifier.
    owner: AztecAddress,
    /// Random value, protects against note hash preimage attacks.
    randomness: Field,
    /// The ID of the token represented by this note.
    token_id: Field,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/types/nft_note.nr#L26-L43" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/types/nft_note.nr#L26-L43</a></sub></sup>


## Functions

Copy and paste the body of each function into the appropriate place in your project if you are following along.

### Constructor

This function sets the admin and makes them a minter, and sets the name and symbol.

```rust title="constructor" showLineNumbers 
#[public]
#[initializer]
fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>) {
    assert(!admin.is_zero(), "invalid admin");
    storage.admin.write(admin);
    storage.minters.at(admin).write(true);
    storage.name.initialize(FieldCompressedString::from_string(name));
    storage.symbol.initialize(FieldCompressedString::from_string(symbol));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L64-L74" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L64-L74</a></sub></sup>


### Public function implementations

Public functions are declared with the `#[public]` macro above the function name.

As described in the [execution contexts section above](#execution-contexts), public function logic and transaction information is transparent to the world. Public functions update public state, but can be used to finalize notes prepared in a private context ([partial notes flow](../../../../aztec/concepts/advanced/storage/partial_notes.md)).

Storage is referenced as `storage.variable`.

#### `set_admin`

The function checks that the `msg_sender` is the `admin`. If not, the transaction will fail. If it is, the `new_admin` is saved as the `admin`.

```rust title="set_admin" showLineNumbers 
#[public]
fn set_admin(new_admin: AztecAddress) {
    assert(storage.admin.read().eq(context.msg_sender()), "caller is not an admin");
    storage.admin.write(new_admin);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L76-L82" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L76-L82</a></sub></sup>


#### `set_minter`

This function allows the `admin` to add or a remove a `minter` from the public `minters` mapping. It checks that `msg_sender` is the `admin` and finally adds the `minter` to the `minters` mapping.

```rust title="set_minter" showLineNumbers 
#[public]
fn set_minter(minter: AztecAddress, approve: bool) {
    assert(storage.admin.read().eq(context.msg_sender()), "caller is not an admin");
    storage.minters.at(minter).write(approve);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L84-L90" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L84-L90</a></sub></sup>


#### `mint`

This public function checks that the `token_id` is not 0 and does not already exist and the `msg_sender` is authorized to mint. Then it indicates that the `token_id` exists, which is useful for verifying its existence if it gets transferred to private, and updates the owner in the `public_owners` mapping.

```rust title="mint" showLineNumbers 
#[public]
fn mint(to: AztecAddress, token_id: Field) {
    assert(token_id != 0, "zero token ID not supported");
    assert(storage.minters.at(context.msg_sender()).read(), "caller is not a minter");
    assert(storage.nft_exists.at(token_id).read() == false, "token already exists");

    storage.nft_exists.at(token_id).write(true);

    storage.public_owners.at(token_id).write(to);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L92-L103" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L92-L103</a></sub></sup>


#### `transfer_in_public`

```rust title="transfer_in_public" showLineNumbers 
#[public]
fn transfer_in_public(
    from: AztecAddress,
    to: AztecAddress,
    token_id: Field,
    authwit_nonce: Field,
) {
    if (!from.eq(context.msg_sender())) {
        assert_current_call_valid_authwit_public(&mut context, from);
    } else {
        assert(authwit_nonce == 0, "invalid authwit nonce");
    }

    let public_owners_storage = storage.public_owners.at(token_id);
    assert(public_owners_storage.read().eq(from), "invalid owner");

    public_owners_storage.write(to);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L145-L164" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L145-L164</a></sub></sup>


##### Authorizing token spends (via authwits)

If the `msg_sender` is **NOT** the same as the account to debit from, the function checks that the account has authorized the `msg_sender` contract to debit tokens on its behalf. This check is done by computing the function selector that needs to be authorized, computing the hash of the message that the account contract has approved. This is a hash of the contract that is approved to spend (`context.msg_sender`), the token contract that can be spent from (`context.this_address()`), the `selector`, the account to spend from (`from`), the `amount` and a `nonce` to prevent multiple spends. This hash is passed to `assert_inner_hash_valid_authwit_public` to ensure that the Account Contract has approved tokens to be spent on it's behalf.

If the `msg_sender` is the same as the account to debit from, the authorization check is bypassed and the function proceeds to update the public owner.

#### `finalize_transfer_to_private`

This public function finalizes a transfer that has been set up by a call to [`prepare_private_balance_increase`](#prepare_private_balance_increase) by reducing the public balance of the associated account and emitting the note for the intended recipient.

```rust title="finalize_transfer_to_private" showLineNumbers 
#[public]
fn finalize_transfer_to_private(token_id: Field, partial_note: PartialNFTNote) {
    // Completer is the entity that can complete the partial note. In this case, it's the same as the account
    // `from` from whose account the token is being transferred.
    let from_and_completer = context.msg_sender();
    _finalize_transfer_to_private(
        from_and_completer,
        token_id,
        partial_note,
        &mut context,
        storage,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L226-L240" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L226-L240</a></sub></sup>


### Private function implementations

Private functions are declared with the `#[private]` macro above the function name like so:

```rust
    #[private]
    fn transfer_in_private(
```

As described in the [execution contexts section above](#execution-contexts), private function logic and transaction information is hidden from the world and is executed on user devices. Private functions update private state, but can pass data to the public execution context (e.g. see the [`transfer_to_public`](#transfer_to_public) function).

Storage is referenced as `storage.variable`.

#### `transfer_to_private`

Transfers token with `token_id` from public balance of the sender to a private balance of `to`. Calls [`_prepare_private_balance_increase`](#prepare_private_balance_increase) to get the hiding point slot (a transient storage slot where we can keep the partial note) and then calls [`_finalize_transfer_to_private_unsafe`](#_finalize_transfer_to_private_unsafe) to finalize the transfer in the public context.

```rust title="transfer_to_private" showLineNumbers 
#[private]
fn transfer_to_private(to: AztecAddress, token_id: Field) {
    let from = context.msg_sender();

    let nft = NFT::at(context.this_address());

    // We prepare the private balance increase.
    let partial_note = _prepare_private_balance_increase(to, &mut context, storage);

    // At last we finalize the transfer. Usage of the `unsafe` method here is safe because we set the `from`
    // function argument to a message sender, guaranteeing that he can transfer only his own NFTs.
    nft._finalize_transfer_to_private_unsafe(from, token_id, partial_note).enqueue(&mut context);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L167-L181" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L167-L181</a></sub></sup>


#### `prepare_private_balance_increase`

This function prepares a [partial note](../../../../aztec/concepts/advanced/storage/partial_notes.md) to transfer an NFT from the public context to the private context. The caller specifies an `AztecAddress` that will receive the NFT in private storage.

:::note

This function calls `_prepare_private_balance_increase` which is marked as `#[contract_library_method]`, which means the compiler will inline the `_prepare_private_balance_increase` function. Click through to the source to see the implementation.

:::

```rust title="prepare_private_balance_increase" showLineNumbers 
#[private]
fn prepare_private_balance_increase(to: AztecAddress) -> PartialNFTNote {
    _prepare_private_balance_increase(to, &mut context, storage)
}

/// This function exists separately from `prepare_private_balance_increase` solely as an optimization as it allows
/// us to have it inlined in the `transfer_to_private` function which results in one less kernel iteration.
///
/// TODO(#9180): Consider adding macro support for functions callable both as an entrypoint and as an internal
/// function.
#[contract_library_method]
fn _prepare_private_balance_increase(
    to: AztecAddress,
    context: &mut PrivateContext,
    storage: Storage<&mut PrivateContext>,
) -> PartialNFTNote {
    let sender_and_completer = context.msg_sender();

    // We setup a partial note with unpopulated/zero token id for 'to'.
    let partial_note = NFTNote::partial(
        to,
        storage.private_nfts.at(to).storage_slot,
        context,
        to,
        sender_and_completer,
        sender_and_completer,
    );

    partial_note
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L185-L216" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L185-L216</a></sub></sup>


#### `cancel_authwit`

Cancels a private authwit by emitting the corresponding nullifier.

```rust title="cancel_authwit" showLineNumbers 
#[private]
fn cancel_authwit(inner_hash: Field) {
    let on_behalf_of = context.msg_sender();
    let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
    context.push_nullifier(nullifier);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L287-L294" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L287-L294</a></sub></sup>


#### `transfer_in_private`

Transfers an NFT between two addresses in the private context. Uses [authwits](../../../../aztec/concepts/advanced/authwit.md) to allow contracts to transfer NFTs on behalf of other accounts.

```rust title="transfer_in_private" showLineNumbers 
#[private]
fn transfer_in_private(
    from: AztecAddress,
    to: AztecAddress,
    token_id: Field,
    authwit_nonce: Field,
) {
    if (!from.eq(context.msg_sender())) {
        assert_current_call_valid_authwit(&mut context, from);
    } else {
        assert(authwit_nonce == 0, "invalid authwit nonce");
    }

    let nfts = storage.private_nfts;

    let notes = nfts.at(from).pop_notes(NoteGetterOptions::new()
        .select(NFTNote::properties().token_id, Comparator.EQ, token_id)
        .set_limit(1));
    assert(notes.len() == 1, "NFT not found when transferring");

    let new_note = NFTNote::new(token_id, to);

    nfts.at(to).insert(new_note).emit(encode_and_encrypt_note(&mut context, to, from));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L296-L321" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L296-L321</a></sub></sup>


#### `transfer_to_public`

Transfers and NFT from private storage to public storage. The private call enqueues a call to [`_finish_transfer_to_public`](#_finish_transfer_to_public) which updates the public owner of the `token_id`.

```rust title="transfer_to_public" showLineNumbers 
#[private]
fn transfer_to_public(
    from: AztecAddress,
    to: AztecAddress,
    token_id: Field,
    authwit_nonce: Field,
) {
    if (!from.eq(context.msg_sender())) {
        assert_current_call_valid_authwit(&mut context, from);
    } else {
        assert(authwit_nonce == 0, "invalid authwit nonce");
    }

    let notes = storage.private_nfts.at(from).pop_notes(NoteGetterOptions::new()
        .select(NFTNote::properties().token_id, Comparator.EQ, token_id)
        .set_limit(1));
    assert(notes.len() == 1, "NFT not found when transferring to public");

    NFT::at(context.this_address())._finish_transfer_to_public(to, token_id).enqueue(
        &mut context,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L323-L346" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L323-L346</a></sub></sup>


### Internal function implementations

Internal functions are functions that can only be called by this contract. The following 3 functions are public functions that are called from the [private execution context](#execution-contexts). Marking these as `internal` ensures that only the desired private functions in this contract are able to call them. Private functions defer execution to public functions because private functions cannot update public state directly.

#### `_finalize_transfer_to_private_unsafe`

This function is labeled as unsafe because the sender is not enforced in this function, but it is safe because the sender is enforced in the execution of the private function that calls this function.

```rust title="finalize_transfer_to_private_unsafe" showLineNumbers 
/// This is a wrapper around `_finalize_transfer_to_private` placed here so that a call
/// to `_finalize_transfer_to_private` can be enqueued. Called unsafe as it does not check `from_and_completer`
/// (this has to be done in the calling function).
#[public]
#[internal]
fn _finalize_transfer_to_private_unsafe(
    from_and_completer: AztecAddress,
    token_id: Field,
    partial_note: PartialNFTNote,
) {
    _finalize_transfer_to_private(
        from_and_completer,
        token_id,
        partial_note,
        &mut context,
        storage,
    );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L242-L261" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L242-L261</a></sub></sup>


#### `_finish_transfer_to_public`

Updates the public owner of the `token_id` to the `to` address.

```rust title="finish_transfer_to_public" showLineNumbers 
#[public]
#[internal]
fn _finish_transfer_to_public(to: AztecAddress, token_id: Field) {
    storage.public_owners.at(token_id).write(to);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L348-L354" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L348-L354</a></sub></sup>


### View function implementations

NFT implements the following `view` functions:

#### `get_admin`

A getter function for reading the public `admin` value.

```rust title="admin" showLineNumbers 
#[public]
#[view]
fn get_admin() -> Field {
    storage.admin.read().to_field()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L129-L135" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L129-L135</a></sub></sup>


#### `is_minter`

A getter function for checking the value of associated with a `minter` in the public `minters` mapping.

```rust title="is_minter" showLineNumbers 
#[public]
#[view]
fn is_minter(minter: AztecAddress) -> bool {
    storage.minters.at(minter).read()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L137-L143" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L137-L143</a></sub></sup>


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

### Utility function implementations

The NFT implements the following [utility](../../../../aztec/concepts/call_types.md#utility) function:

#### `get_private_nfts`

A getter function for checking the private balance of the provided Aztec account. Returns an array of token IDs owned by `owner` in private and a flag indicating whether a page limit was reached.

```rust title="get_private_nfts" showLineNumbers 
#[utility]
unconstrained fn get_private_nfts(
    owner: AztecAddress,
    page_index: u32,
) -> ([Field; MAX_NOTES_PER_PAGE], bool) {
    let offset = page_index * MAX_NOTES_PER_PAGE;
    let mut options = NoteViewerOptions::new();
    let notes = storage.private_nfts.at(owner).view_notes(options.set_offset(offset));

    let mut owned_nft_ids = [0; MAX_NOTES_PER_PAGE];
    for i in 0..options.limit {
        if i < notes.len() {
            owned_nft_ids[i] = notes.get_unchecked(i).token_id;
        }
    }

    let page_limit_reached = notes.len() == options.limit;
    (owned_nft_ids, page_limit_reached)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L367-L387" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L367-L387</a></sub></sup>


## Compiling

Now that the contract is complete, you can compile it with `aztec-nargo`. See the [Sandbox reference page](../../../reference/environment_reference/index.md) for instructions on setting it up.

Run the following command in the directory where your `Nargo.toml` file is located:

```bash
aztec-nargo compile
```

Once your contract is compiled, optionally generate a typescript interface with the following command:

```bash
aztec codegen target -o src/artifacts
```

### Optional: Dive deeper into this contract and concepts mentioned here

- Review [the end to end tests (Github link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/e2e_nft.test.ts) for reference.
- [Nullifier tree](../../../../aztec/concepts/advanced/storage/indexed_merkle_tree.mdx)
- [Public / Private function calls](../../../../aztec/smart_contracts/functions/public_private_calls.md).
- [Contract Storage](../../../../aztec/concepts/storage/index.md)
- [Authwit](../../../../aztec/concepts/advanced/authwit.md)
