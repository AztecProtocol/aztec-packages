---
title: Implementing a Token Contract
sidebar_position: 1
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

`aztec-up -v 2.0.2`

(optional) To set up the LSP for Aztec programming, go to the Noir extension settings in VSCode and under `Noir: Nargo Path` set this value to the location of `aztec-nargo` installed in the command above (this should be in `~/.aztec/bin/aztec-nargo`). `aztec-nargo` is the Noir build tool pinned at a version bundled with each Aztec release to ensure compatibility.

### Project setup and structure

Clone the [`aztec-examples` repository](https://github.com/AztecProtocol/aztec-examples) and navigate to the `starter-token/start-here` folder. This folder will be our main reference through out this tutorial.

This tutorial uses both Aztec.nr and Aztec.js to write code that interacts with the network.

#### Aztec.nr

Aztec.nr is the smart contract framework for building private applications on Aztec using Noir. Noir is a Rust-inspired DSL for writing zero-knowledge proofs; Aztec.nr extends it with Aztec-specific libraries for state management, privacy primitives, and protocol interactions.

It provides rails that helps you implement best practices and avoid potentially dangerous ones (eg letting a user spend another user's notes).

#### Aztec.js

Aztec.js is the library for interacting with the Aztec network. It provides tools for deploying contracts, managing accounts, sending transactions, and querying private state. The SDK handles encryption, note management, and proof generation, enabling developers to build privacy-first applications using familiar web development patterns.

### Define a contract with Aztec.nr

First, take a quick look at Nargo.toml in `contract/`

```toml
[package]
name = "starter_token_contract"
authors = [""]
compiler_version = ">=1.0.0"
type = "contract"

[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-packages/", tag = "v2.0.2", directory = "noir-projects/aztec-nr/aztec" }
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


## Building the Contract

### Writing the Contract


In this section you will build a token contract with both public and private functionality on Aztec. You'll start with a basic public token (similar to an ERC-20), then add private state and functions, implement cross-domain interactions between private and public execution, and finally explore the composability of Aztec contracts through cross-contract interactions.

The token contract used in this tutorial has two basic operations: mint and transfer in both public and private. Only designated owners can mint, while anyone with a sufficient balance can transfer.

Please make sure to import any missing definitions as you come across them when following along with this tutorial. The imports and code snippets shared are assumed to be placed directly inside the contract struct, like so.

For example, if you need to use the state variable `PublicMutable`, you can use the noir extension to automatically import it, or you can manually locate the specific type from Aztec.nr.


```noir
pub contract StarterToken {
    use aztec::state_vars::public_mutable::PublicMutable,
    ...
}
```

Note any further required imports follow Rust formatting. If any further clarification is needed, please take a look at the completed imports section in the contract under the `starter-token/reference` folder.

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

The verbose `<Context>` declarations are required by Noir's type system (inherited from Rust).

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

Private state in Aztec uses a UTXO model with "notes" rather than account balances. In this token contract, each note represents a discrete amount of tokens owned by a specific address. When you transfer tokens privately, you create new notes for the recipient rather than updating their balance directly (since their balance is private and unknown to you). A user's total token balance is the sum of all their unspent notes, which only they can see and spend.

### Update storage

As setup, first import `easy_private_state` by adding it to your `[dependencies]` section in your `Nargo.toml`.

```
[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-packages/", tag = "v2.0.2", directory = "noir-projects/aztec-nr/aztec" }
easy_private_state = { git = "https://github.com/AztecProtocol/aztec-packages/", tag = "v2.0.2", directory = "noir-projects/aztec-nr/easy-private-state" }
```

Then import `EasyPrivateUint` at the top of your contract:

```
use aztec::macros::aztec;

pub contract StarterToken {
  ...
  use easy_private_state::EasyPrivateUint;
  ...
}
```

EasyPrivateUint is a wrapper of `PrivateSet` that enables the storing of collections of u128 values in private state. It handles the complexity of using notes and `PrivateSet` directly. It allows anyone to add a note to a user's accumulated balance, while only letting the recipient view or spend them.

Add private balances alongside public ones:

```noir
#[storage]
struct Storage<Context> {
    // Public state
    balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
    owner: PublicMutable<AztecAddress, Context>,

    // Private state
    private_balances: Map<AztecAddress, EasyPrivateUint<Context>, Context>
}
```


Use `PrivateSet` (or its wrappers) instead of `PrivateMutable` for private balances. Since private state works by accumulating notes rather than updating a single value, `PrivateSet` allows multiple parties to add notes to someone's balance without needing to know their current total.

### Mint private tokens

Create a function to mint private tokens:

```noir
#[private]
fn mint_private(to: AztecAddress, amount: u64) {
    storage.private_balances.at(to).add(amount, to);
}
```

Like the `#[public]` macro, the `#[private]` macro exposes the storage variable, but instead of providing a `PublicContext`, it provides a `PrivateContext`.

This function:
1. Creates a new note with the specified value
2. Inserts it into the recipient's note set
3. Emits an encrypted log so the recipient can discover the note


**Important**: At this point, the contract allows anyone to mint private tokens. Part 4 shows you how to add access control.

### Transfer private tokens

Transferring private tokens requires three steps:

#### Step 1: Spend sender's notes

```noir
fn transfer_private(to: AztecAddress, amount: u64) {
    let sender = context.msg_sender();

    storage.private_balances.at(sender).sub(amount, sender);
```

This code fetches all notes of the sender and verifies they sum to at least the transfer amount. It then spends those notes to remove them from the sender's balance.

#### Step 2: Create recipient's note

```noir
    storage.private_balances.at(to).add(amount, to);
}
```

This mirrors the `mint` example above.

Your full function should look like this:

```noir
#[private]
fn transfer_private(to: AztecAddress, amount: u64) {
    let sender = context.msg_sender();

    storage.private_balances.at(sender).sub(amount, sender);

    storage.private_balances.at(to).add(amount, to);
}
```

### View private balances

Add a utility function to check private balances locally:

```noir
#[utility]
unconstrained fn view_private_balance(owner: AztecAddress) -> Field {
    storage.private_balances.at(owner).get_value()
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

You cannot use `PrivateMutable` for ownership that others **need to verify**. While it might seem logical to declare a `PrivateMutable private_owner`, this won't work because private notes can only be read by their owner. When someone else tries to check who owns the contract, they would be unable to fetch the private note containing this information, causing the check to fail. For ownership information that needs to be publicly verifiable, you must use public state.

To enforce ownership checks in private functions, you can enqueue a public function call that executes after the private portion completes. This public function can access the public owner state variable to validate ownership. If the validation fails, the entire transaction reverts, including the private operations. Here's how to implement this pattern:

```noir
#[public]
#[internal]
fn _assert_is_owner(maybe_owner: AztecAddress) {
    assert_eq(maybe_owner, storage.owner.read());
}
```

The `#[internal]` macro restricts this function to internal calls only. By convention, internal functions are prefixed with a '_'.

Now update the private mint to enqueue this check:

```noir
#[private]
fn mint_private(to: AztecAddress, amount: u64) {
    // Enqueue public validation
    StarterToken::at(context.this_address())._assert_is_owner(context.msg_sender()).enqueue(&mut context);

    storage.private_balances.at(to).add(amount, to);
}
```

If the public validation fails, the entire transaction reverts, even though the private proof was valid. This common pattern enables access control across execution domains.

## Part 5 (Bonus): Cross-contract interactions

Aztec contracts can call functions on other contracts, enabling composability for use cases like AMMs and swaps. Cross-contract calls work similarly to enqueuing public functions, but use the external contract's address instead of `context.this_address()`.

Navigate to `contract/src/external_call_contract.nr` to see an example. The calling contract needs the target contract's address:


```noir
#[private]
fn call_mint_on_other_contract(contract_address: AztecAddress, to: AztecAddress, amount: u64) {
    StarterToken::at(contract_address).mint_private(to, amount).call(&mut context);
}
```

Note that if `mint_private` returned a value, it could be accessed by calling `.get_preimage()` on the return value of `.call()`.

## Build and deploy

Compile your contract:
```bash
aztec-nargo compile
```

Postprocess your contract:
```bash
aztec-postprocess-contract
```

Generate TypeScript bindings:
```bash
aztec codegen target --outdir ../ts/artifacts
```

This generates everything you need to interact with your contract from TypeScript and places it into the `ts/artifacts` folder.

### Testing

#### Sandbox via Aztec.js

Now that you've written your first Aztec contract, you can deploy and test it using the sandbox.

The sandbox is a local replica of the entire Aztec protocol stack, including the node and Private eXecution Environment (PXE). It lets you deploy and interact with contracts locally before deploying to a real network. You'll interact with it using TypeScript and Aztec.js.

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

This code introduces the Private eXecution Environment (PXE), which is the client-side software that creates proofs, stores state, and interacts with the network. Wallets typically embed this component, so users don't interact with it directly. Treat it as a black box for now. Learn more about the PXE [here](../../concepts/pxe/index.md).

Define the wallets or accounts you'll use. This example uses prefunded test wallets:

```typescript
const wallets = await getInitialTestAccountsWallets(pxe);
const deployerWallet = wallets[0];
const deployerAddress = deployerWallet.getAddress();
```

You obtain test wallets and assign the first as the deployer.

Note: "Wallets" here aren't the same as general-purpose wallets. We will dive deeper into those definitions later.

Deploy your contract:

```typescript
const starterTokenContract = await StarterTokenContract
  .deploy(deployerWallet)
  .send({
    from: deployerAddress
  }).wait();
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
