---
title: Getting Started
sidebar_position: 0
tags: [sandbox, testnet]
description: Quick start guide for developers to set up their environment and begin building on Aztec.
---

## Write your first Aztec contract and deploy it to the sandbox

### Installation

#### Prerequisites:
Before you start, ensure you have a working environment. You need:
* Docker
* `aztec-up` - install by running
```sh
bash -i <(curl -s https://install.aztec.network)
```
* Node.js (minimum version 22)

For easier development, install the Noir extension/LSP for VSCode ([download](https://marketplace.visualstudio.com/items?itemName=noir-lang.vscode-noir)).

Once the prerequisites are met, run this command to install the Aztec toolchain:

`aztec-up #include_version_without_prefix`

(optional) To set up the LSP for Aztec programming, go to the Noir extension settings in VSCode and under `Noir: Nargo Path` set this value to the location of `aztec-nargo` installed in the command above (this should be in `~/.aztec/bin/aztec-nargo`). `aztec-nargo` is the Noir build tool pinned at a version bundled with each Aztec release to ensure compatibility.

### Project setup and structure

Clone the [`aztec-examples` repository](https://github.com/AztecProtocol/aztec-examples) and navigate to the `starter-token/start-here` folder. The contents of this folder illustrate project structure and serve as a reference for this tutorial.

This tutorial uses both Aztec.nr and Aztec.js to write code that interacts with the network.

#### Aztec.nr

The framework for writing Aztec contracts in Noir. Noir is a chain-agnostic Domain Specific Language (DSL) for writing zero-knowledge proofs; Aztec.nr is a package that enables Noir to interact with the Aztec protocol.

Key `Aztec.nr` goals:
* Provide rails that help you implement best practices
* Make unsafe operations clear

#### Aztec.js

The library for network interaction, exposing contracts, accounts, and execution environments in JavaScript.

### Define a contract with Aztec.nr

First, take a quick look at Nargo.toml in `contract/`

```toml
[package]
name = "starter_token_contract"
authors = [""]
compiler_version = ">=1.0.0"
type = "contract"

[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-packages/", tag = "v1.2.1", directory = "noir-projects/aztec-nr/aztec" }
```

This file is required and defines the contract's metadata and dependencies (including Aztec.nr).

After reviewing `Nargo.toml`, you can start reviewing the contract itself. Navigate to `contract/src/main.nr` and review the code stub.

```noir
use aztec::macros::aztec;

#[aztec]
pub contract StarterToken {
  // Start here !
}
```

This code is a bare-bones Aztec contract. It imports the `aztec` macro, which defines and annotates a contract using the `contract` keyword. Macros are very important and prevalent throughout Aztec contracts, because Aztec.nr uses them to inject code into and transform code of the structs and functions they decorate.


### Writing the Contract

## Building the Contract


In this section you will build a token contract with both public and private functionality on Aztec. You'll start with a basic public token (similar to an ERC-20), then add private state and functions, implement cross-domain interactions between private and public execution, and finally explore the composability of Aztec contracts through cross-contract interactions.

The token contract used in this tutorial has two basic operations: mint and transfer in both public and private. Only designated owners can mint, while anyone with a sufficient balance can transfer.

Please make sure to import any missing definitions as you come across them when following along with this tutorial. The imports and code snippets shared are assumed to be placed directly inside the contract struct, like so.

```noir
pub contract StarterToken {
    use aztec::{
        state_vars::{private_set::PrivateSet, public_mutable::PublicMutable, map::Map},
    ...<continues>
```

## Part 1: Public token contract

### Set up storage

First, define the contract's storage structure. To declare storage, use a `Storage` struct with the `#[storage]` macro:

```noir
#[storage]
struct Storage<Context> {
    owner: PublicMutable<AztecAddress, Context>,
    balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
}
```

This creates:
- `owner`: A mutable public state variable that stores the contract owner's address
- `balances`: A map from user addresses to their token balances (as a u128, the largest unsigned int type). Note that the value of this map is also a mutable public state variable

The `#[storage]` macro injects code to expose the contents of this struct to:
- other functions defined in the contract
- any non-Noir consumer of the contract (like Aztec.js) via the artifact

The `PublicMutable` wrapper ensures proper state management. The verbose `<Context>` declarations are required by Noir's type system (inherited from Rust). Aztec.nr improvements are continually being considered, and in a future release these declarations may be further hidden behind macros.

### Initialize the contract

Use an initializer to set the contract owner when the contract is first deployed.

```noir
#[initializer]
#[public]
fn setup() {
    // The deployer becomes the owner
    storage.owner.write(context.msg_sender());
}
```

The `#[initializer]` macro ensures that this function runs before any other functions in the contract. It is useful in situations where some setup is required before the other functions can operate correctly. In this case the initializer helps ensure that the owner is never undefined.

The `#[public]` macro provides access to:
- `storage`: Your contract's state variables
- `context`: Execution context including `msg_sender()`

These context variables are essential for verifying proper execution. [Learn more about the execution context →](#Part-3-Execution-environments)

### Add minting

Add a mint function that only the owner can call:

```noir
#[public]
fn mint(to: AztecAddress, amount: u128) {
    assert_eq(context.msg_sender(), storage.owner.read());

    let recipient_balance = storage.balances.at(to).read();
    storage.balances.at(to).write(recipient_balance + amount);
}
```

This function:
1. Verifies the caller is the owner
2. Reads the recipient's current balance
3. Adds the minted amount to their balance

Note that you access the user value with the `Map` via `.at`, and like the above, the explicit use of `.write()` to interact with the `PublicMutable`.

### Enable transfers

Enable token transfers between users:

```noir
#[public]
fn transfer(to: AztecAddress, amount: u128) {
    let sender = context.msg_sender();
    let sender_balance = storage.balances.at(sender).read();

    assert(sender_balance >= amount, "Insufficient balance");

    storage.balances.at(sender).write(sender_balance - amount);

    let recipient_balance = storage.balances.at(to).read();
    storage.balances.at(to).write(recipient_balance + amount);
}
```

This function:
1. Reads the sender's current balance
2. Verifies that the balance is greater than the amount being sent
3. Sets the sender's balance to their current balance minus the amount being sent
4. Reads the recipient's current balance
5. Adds the transferred amount to their balance

### Transfer ownership

Add a function to change the contract owner:

```noir
#[public]
fn transfer_ownership(new_owner: AztecAddress) {
    assert_eq(context.msg_sender(), storage.owner.read());
    storage.owner.write(new_owner);
}
```

This function:
1. Verifies the caller is the owner
2. Writes the new owner in contract storage

**Checkpoint**: You now have a basic public token contract with mint, transfer, and ownership functions. Next, add private functionality.

## Part 2: Adding private state

### Private state primer

Private state in Aztec uses UTXO-style "notes" instead of account balances like public state above. In this example, when a user wants to transfer their tokens privately, updating an account balance would not work, as this would require knowledge of the recipient's private balance. Instead, you can use discrete units of value that can be aggregated by the recipient. Aztec.nr provides abstractions for safe and efficient uses of these notes. A few key things to keep in mind:

Notes are discrete units of value owned by specific addresses
Collections of notes represent a user's total balance
Only note owners can see and spend their notes

### Update storage

As setup, first import `UintNote` by adding it to your `[dependencies]` section in your `Nargo.toml`.

```
[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-packages/", tag = "v1.2.1", directory = "noir-projects/aztec-nr/aztec" }
uint_note = { git = "https://github.com/AztecProtocol/aztec-packages/", tag = "v1.2.1", directory = "noir-projects/aztec-nr/uint-note" }
```

Then import `UintNote` at the top of your contract:

```
use aztec::macros::aztec;

pub contract StarterToken {
  ...
  use dep::uint_note::uint_note::UintNote;
  ...
}
```

UintNote is a wrapper that enables the storing of u128 values in private state, with auxiliary metadata / functions like `compute_note_hash` and `compute_nullifier` to define how this note is represented in the Aztec state trees. Also, It also allows you to define partial notes, structures that enable you to create notes with partially private and partially public properties.

Add private balances alongside public ones:

```noir
#[storage]
struct Storage<Context> {
    // Public state
    balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
    owner: PublicMutable<AztecAddress, Context>,

    // Private state
    private_balances: Map<AztecAddress, PrivateSet<UintNote, Context>, Context>,
}
```


As a best practice, use `PrivateSet` instead of `PrivateMutable`: private state accumulates notes rather than updating a single value. By using this state variable, multiple parties can add notes to a balance without knowing the current total (which updating requires).

### Mint private tokens

Create a function to mint private tokens:

```noir
#[private]
fn mint_private(to: AztecAddress, amount: u128) {
    storage.private_balances.at(to)
        .insert(UintNote::new(value, to));
        .emit(encode_and_encrypt_note(&mut context, to));
}
```

Like the `#[public]` macro, the `#[private]` macro exposes the storage variable, but instead of providing a `PublicContext`, it provides a `PrivateContext`.

This function:
1. Creates a new note with the specified value
2. Inserts it into the recipient's note set
3. Emits an encrypted log so the recipient can discover the note

Note that creating the note is decoupled from emitting the note as a log for the recipient to discover. If the note is not emitted to DA, you would need to transfer the note content to the recipient off-band.

**Important**: At this point, the contract allows anyone to mint private tokens. Part 4 shows you how to add access control.

### Transfer private tokens

Transferring private tokens requires three steps:

#### Step 1: Spend sender's notes

```noir
fn transfer_private(to: AztecAddress, amount: u128) {
    let sender = context.msg_sender();

    // Fetch and spend all sender's notes
    let notes = storage.private_balances.at(sender)
        .pop_notes(NoteGetterOptions::new());

    // Calculate total value
    let mut subtracted = 0 as u128;
    for i in 0..notes.len() {
        let note = notes.get_unchecked(i);
        subtracted = subtracted + note.get_value();
    }

    assert(subtracted >= amount);
```

This code fetches all notes (up to `MAX_NOTE_READ_REQUESTS`) and verifies they sum to at least the transfer amount. The protocol limits notes per function call, to ensure that proof generation time is reasonable. There are better ways to fetch these notes, which include using `NoteGetterOptions` to define potential preprocessors, sorts, and filters (not covered in this tutorial).

Note that in this example, you "spend" or "nullify" all of your notes by `popping` them from your set.  It is okay to spend all of your notes, because later you will create a change note with the difference of your spent notes and the desired transfer amount if any exists. If the accumulated note value is less than the amount to be sent, generating the proof will fail, and you will not have actually "spent" the notes that you are popping from your balance. No side effects are applied (and no notes are spent) until a valid proof is generated and submitted to the chain.

#### Step 2: Create recipient's note

```noir
    storage.private_balances.at(to)
        .insert(UintNote::new(amount, to));
        .emit(encode_and_encrypt_note(&mut context, to));
```

This mirrors the `mint` example above.

#### Step 3: Return change to sender

```noir
    let change = subtracted - amount;
    if change > 0 {
        storage.private_balances.at(sender)
            .insert(UintNote::new(change, sender))
            .emit(encode_and_encrypt_note(&mut context, sender, sender));
    }
}
```

When using discrete note amounts, the notes from the sender that have been spent might amount to more than the desired transfer amount. In this case, it is necessary to create a change note and give it to the sender, to make up for any overspending.

Your full function should look like this:

```noir
    #[private]
    fn transfer_private(to: AztecAddress, amount: u128) {
        let sender = context.msg_sender();

        // This can be optimized with a preprocessor
        // This will fail in a case where the accumulated note value < amount, but we have more notes than what can be read in one iteration.
        let notes = storage.private_balances.at(sender).pop_notes(NoteGetterOptions::new());

        // This is a very naive approach that just consolidates all the user's notes into one change note.
        let mut subtracted = 0 as u128;
        for i in 0..notes.len() {
            let note = notes.get_unchecked(i);
            subtracted = subtracted + note.get_value();
        }

        assert(subtracted >= amount);

        storage.private_balances.at(to)
            .insert(UintNote::new(amount, to))
            .emit(encode_and_encrypt_note(&mut context, to));

        let change = subtracted - amount;

        // This possibly creates a change note of 0, but that is okay in our case because we will be consolidating via this method
        storage.private_balances.at(sender)
            .insert(UintNote::new(change, sender))
            .emit(encode_and_encrypt_note(&mut context, sender, sender));
    }
```

### View private balances

Add a utility function to check private balances locally:

```noir
#[utility]
unconstrained fn view_private_balance(owner: AztecAddress) -> BoundedVec<UintNote, MAX_NOTES_PER_PAGE> {
    storage.user_private_state.at(key: owner).view_notes(NoteViewerOptions::new())
}
```

The `#[utility]` macro indicates local-only execution without generating proofs nor altering any network / global state. This function fetches unspent notes from your local state.

## Part 3: Execution environments

Aztec has three execution environments:

1. **Private**: Executes locally on user devices with historical state. All transactions start here.
2. **Public**: Executes on sequencers with current state (similar to Ethereum).
3. **Utility**: Local queries that don't affect network state or require proofs.

### Key concept: Separation of concerns

Private and public execution happen separately:
- Private functions can't read current public state (but they can read historical public state)
- Public functions can't read private state
- Private execution uses historical data and happens first

The main side effect is a decoupling between private and public state, and any transaction that accesses private and public state must take this into account. This separation is fundamental to maintaining privacy while enabling composability.

## Part 4: Cross-domain interactions

### The challenge

The private mint function lacks access control (anyone can mint). But the owner is stored in public state, which private functions can't access directly.

### The solution

Although it might seem that one could declare something like a `PrivateMutable private_owner` to use in private, nobody besides the owner (the owner of the note) would be able to access it, as they wouldn't have the note itself, and any checking of this state variable will result in a failure to fetch said note by anyone besides the owner. Some kind of publicly available state variable is necessary to store this value.

You can enqueue a public function call that happens after the private one, to check that the minter is the owner. This function will have access to current public state that we can use to validate ownership. If this call fails, the entire transaction will not be applied and the mint will not go through. You can define it like this:

```noir
#[public]
#[internal]
fn assert_is_owner(maybe_owner: AztecAddress) {
    assert_eq(maybe_owner, storage.owner.read());
}
```

The `#[internal]` macro restricts this function to internal calls only.

Now update the private mint to enqueue this check:

```noir
#[private]
fn mint_private(to: AztecAddress, amount: u128) {
    // Enqueue public validation
    GettingStarted::at(context.this_address())._assert_is_owner(context.msg_sender()).enqueue(&mut context);

    // Proceed with minting
    storage.private_balances.at(to)
        .insert(UintNote::new(value, to));
        .emit(encode_and_encrypt_note(&mut context, to));
}
```

If the public validation fails, the entire transaction reverts, even though the private proof was valid. This common pattern enables access control across execution domains.

## Part 5 (Bonus): Cross-contract interactions

Calling external contracts can be done in a similar way as enqueuing a call from private to public, but instead of using `context.this_address()`, you use the external address. This pattern is required for most real-life use cases including automated market makers or swaps, and the composability enabled by this is a key thing that differentiates Aztec from standalone Noir applications (and other privacy apps) that live in their own little silos and settle directly to some Solidity contract. While this tutorial does not have the scope to go over the use cases mentioned above, it will give an example of how you could call one contract from another.

Navigate to `contract/src/external_call_contract.nr` to see an example. Note that the contract calling the  token contract would need its address.

The relevant function that makes the external call is below.

```noir
#[private]
fn call_mint_on_other_contract(contract_address: AztecAddress, to: AztecAddress, amount: u128) {
  GettingStarted::at(contract_address).mint_private(to, amount).call(&mut context);
}
```

Note that if `mint_private` returned a value, it could be accessed by calling `.get_preimage()` on the return value of `.call()`.

## Build and deploy

Compile your contract:
```bash
aztec-nargo compile
```

Generate TypeScript bindings:
```bash
aztec codegen target --outdir ../ts/artifacts
```

This generates everything you need to interact with your contract from TypeScript and places it into the `ts/artifacts` folder.

### Testing

#### Sandbox via Aztec.js

Now that you have finished writing your first Aztec contract, you can use the sandbox with Aztec.js to deploy and test it.

The sandbox is a local replica of the entire Aztec protocol stack, including the node and Private eXecution Environment (PXE) that lets you deploy and interact with contracts in a relatively realistic fashion. You'll interact with the it using TypeScript.

Note that state resets when you restart the sandbox.

1. Navigate to the `ts` folder

2. Install JavaScript dependencies with `npm i`. Dependencies include Aztec.js, TypeScript, and helpers. Check package.json for the complete list.

3. Inspect the index.ts file and continue writing the script
The code starts off by importing the code we generated in the last section of the tutorial. Make sure to auto-import any missing functions from Aztec.js or other dependencies when following along.

```typescript
import { StarterTokenContract } from '../artifacts/StarterToken.js';
```

You should first connect to the PXE exposed by the sandbox using the default port.

```typescript
const pxe = createPXEClient('http://localhost:8080');
await waitForPXE(pxe);
```

This code introduces the Private eXecution Environment (PXE), which is the client-side software that creates proofs, stores state, and interacts with the network. Wallets typically embed this component, so users don't interact with it directly. Treat it as a black box for now. Learn more about the PXE (here).

Define the wallets or accounts you'll use. This example uses prefunded test wallets:

```typescript
const wallets = await getInitialTestAccountsWallets(pxe);
const deployerWallet = wallets[0];
```

You obtain test wallets and assign the first as the deployer.

Note: "Wallets" here aren't the same as general-purpose wallets. This naming will change for clarity. For this tutorial, think of a wallet as the keys and information needed to verify account ownership and perform actions.

Deploy your contract:

```typescript
const gettingStartedContract = await GettingStartedContract
  .deploy(deployerWallet)
  .send().wait();
```

4. To run this code against your sandbox, open a new terminal window, ensure Docker is running, and execute `aztec start --sandbox`.

This starts a local Aztec blockchain that runs in a Docker container, listening for instructions on the configured port (default: localhost:8080).

5. Return to your original terminal window and execute `npm start`. This command runs the TypeScript code you just wrote to deploy the contract in the sandbox.

6. Confirm the deployment by checking the sandbox terminal window for output similar to this:
```
INFO: pxe:service Added contract StarterToken at 0x... with class 0x...
INFO: pxe:service Proving completed in 888.888...ms
INFO: node Received tx 0x...
INFO: pxe:service Sent transaction 0x...
INFO: simulator:public-processor Processed 1 successful txs and 0 failed txs in 0.888s
INFO: sequencer Built block 8 for slot 8 with 1 txs and 0 messages. 88888.888 mana/s
```
