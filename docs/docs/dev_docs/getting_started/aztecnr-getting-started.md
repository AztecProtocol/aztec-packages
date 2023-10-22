---
title: Getting Started with Aztec.nr
---

In this guide, we will create our first Aztec.nr smart contract. We will build a simple private counter. This contract will get you started with the basic setup and syntax of Aztec.nr, but doesn't showcase the awesome stuff Aztec is capable of.

If you already have some experience with Noir and want to build a cooler contract that utilizes both private and public state, you might want to check out the [token contract tutorial instead](../tutorials/writing_token_contract.md).

## Prerequisites

- You have followed the [quickstart](./quickstart.md)
- Running Aztec Sandbox

## Install nargo

`Aztec.nr` is a framework built on top of [Noir](https://noir-lang.org), a zero-knowledge DSL. Nargo is the build tool for Noir, similar to cargo for Rust. We need it for compiling our smart contracts.

<InstallNargoInstructions />

You can check it has been installed correctly by running:

```bash
aztec-cli get-node-info
```

It should print something similar to:

```bash
➜  ~ aztec-cli get-node-info

Node Info:

Version: 1
Chain Id: 31337
Rollup Address: 0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9
Client: pxe@0.7.5
Compatible Nargo Version: 0.16.0-aztec.0
```

## Set up a project

Create a new directory called `aztec-private-counter`

```bash
mkdir aztec-private-counter
```

then create a `contracts` folder inside where our Aztec.nr contract will live:

```bash
cd aztec-private-counter
mkdir contracts
```

Inside `contracts`, create a new Noir project using nargo:

```bash
cd contracts
nargo new counter --contract
```

The `contract` flag will create a contract nargo project rather than using vanilla Noir.

Your file structure should look like this:

```bash
aztec-private-counter
|-contracts
| |--counter
| |  |--src
| |  |  |--main.nr
| |  |Nargo.toml
```

The file `main.nr` will soon turn into our smart contract!

Your `Nargo.toml` file should look something like this:

```toml
[package]
name = "counter"
type = "contract"
authors = [""]
compiler_version = "0.16.0"

[dependencies]
```

Add the following dependencies under `[dependencies]`:

```toml
aztec = { git="https://github.com/AztecProtocol/aztec-packages", tag="master", directory="yarn-project/noir-libs/aztec-noir" }
value_note = { git="https://github.com/AztecProtocol/aztec-packages", tag="master", directory="yarn-project/noir-libs/value-note"}
easy_private_state = { git="https://github.com/AztecProtocol/aztec-packages", tag="master", directory="yarn-project/noir-libs/easy-private-state"}
```

## Define the functions

Go to `main.nr` and replace the code with this contract and functions:

```rust
contract Counter {
    #[aztec(private)]
    fn constructor(initial_count: u120, owner: Field) {}

    #[aztec(private)]
    fn increment(owner: Field) {}

    unconstrained fn getCounter(owner: Field) -> Field {
        0
    }
}
```

This code defines a contract called `Counter` with four functions that we will implement later - a `constructor` which is called when the contract is deployed, `increment`, and `getCounter`.

We have annotated the functions with `#[aztec(private)]` which are ABI macros so the compiler understands it will handle private inputs. Learn more about functions and annotations [here](../contracts/syntax/functions.md).

The `getCounter` function doesn’t need this as it will only be reading from the chain, not updating state, similar to a `view` function in Solidity. This is what `unconstrained` means.

## Imports

We need to define some imports.

Write this within your contract at the top:

```rust
    use dep::aztec::{
        context::{PrivateContext, Context},
        note::{
            note_header::NoteHeader,
            utils as note_utils,
        },
        state_vars::map::Map,
    };
    use dep::value_note::{
            balance_utils,
            value_note::{
                ValueNoteMethods,
                VALUE_NOTE_LEN,
            },
    };
    use dep::easy_private_state::easy_private_state::EasyPrivateUint;
```

`context::{PrivateContext, Context}`

Context gives us access to the environment information such as `msg.sender`. We are also importing `PrivateContext` to access necessary information for our private functions. We’ll be using it in the next step.

`map::Map`

Map is a private state variable that functions like a dictionary, relating Fields to other state variables. You can learn more about it [here](../contracts/syntax/).

`value_note`

Notes are fundamental to how Aztec manages privacy. A note is a privacy-preserving representation of an amount of tokens associated with an address, while encrypting the amount and owner. In this contract, we are using the `value_note` library. This is a type of note interface for storing a single Field, eg a balance - or, in our case, a counter.

We are also using `balance_utils` from this import, a useful library that allows us to utilize value notes as if they are simple balances.

`EasyPrivateUint`

This allows us to store our counter in a way that acts as an integer, abstracting the note logic.

## Implement a Storage struct

In this step, we will initiate a `Storage` struct to store balances in a private way. The vast majority Aztec.nr smart contracts will need this.

```rust
struct Storage {
        counts: Map<EasyPrivateUint>,
    }
```

We are only storing one variable - `counts` as a `Map` of `EasyPrivateUint`. This means our `count` will act as a private integer, and we can map it to an address.

```rust
impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                counters: Map::new(
                    context,
                    1,
                    |context, slot| {
                        EasyPrivateUint::new(context, slot)
                    },
                ),
            }
        }
    }
```

This `init` method is creating and initializing a `Storage` instance. This instance includes a `Map` named `counters`. Each entry in this `Map` represents an account's counter.

## Keep the counter private

Now we’ve got a mechanism for storing our private state, we can start using it to ensure the privacy of balances.

Let’s create a `constructor` method to run on deployment that assigns an initial supply of tokens to a specified owner. In the constructor we created in the first step, write this:

```rust
 #[aztec(private)]
    fn constructor(initial_counter: u120, owner: Field) {
        let counts = storage.counts;
        counts.at(owner).add(headstart, owner);
    }
```

This function accesses the counts from storage. Then it assigns the passed initial counter to the `owner`'s counter privately using `at().add()`.

## Incrementing our counter

Now let’s implement the `increment` functio we defined in the first step.

```rust
 #[aztec(private)]
      fn increment(owner: Field)  {
        let couners = storage.counters;
        counters.at(owner).add(1, owner);
    }
```

The `increment` function works very similarly to the `constructor`, but instead directly adds 1 to the counter rather than passing in an initial count parameter.

## Prevent double spending

Because our counters are private, the network can't directly verify if a note was spent or not, which could lead to double-spending. To solve this, we use a nullifier - a unique identifier generated from each spent note and its owner. Although this isn't really an issue in this simple smart contract, Aztec requires a contract that has any private functions to include this function.

Add a new function into your contract as shown below:

```rust
unconstrained fn compute_note_hash_and_nullifier(
    contract_address: Field,
    nonce: Field,
    storage_slot: Field,
    preimage: [Field; VALUE_NOTE_LEN],
) -> [Field; 4] {
    let note_header = NoteHeader { contract_address, nonce, storage_slot };
    note_utils::compute_note_hash_and_nullifier(ValueNoteMethods, note_header, preimage)
}
```

Here, we're computing both the note hash and the nullifier. The nullifier computation uses Aztec’s `compute_note_hash_and_nullifier` function, which takes details about the note's attributes eg contract address, nonce, storage slot, and preimage.

## Getting a counter

The last thing we need to implement is the function in order to retrieve a counter. In the `getCounter` we defined in the first step, write this:

```rust
unconstrained fn get_counter(owner: Field) -> Field {
    let counts = storage.counters;
    balance_utils::get_balance(counters.at(owner).set)
}
```

This function is `unconstrained` which allows us to fetch data from storage without a transaction. We retrieve a reference to the `owner`'s `counter` from the `counters` Map. The `get_balance` function then operates on the owner's counter. This yields a private counter that only the private key owner can decrypt.

## Test with the CLI

Now we've written a simple Aztec.nr smart contract, it's time to ensure everything works by testing with the CLI.

### Compile the smart contract

In the root of the `nargo` project, run this:

```bash
aztec-cli compile .
```

This will compile the smart contract and create a `target` folder with a `.json` artifact inside.

### Deploy

You can use the previously generated artificat to deploy the smart contract. Our constructor takes two arguments - `initial_counter` and `owner` so let's make sure to pass those in.

`initial_counter` can be any uint. In this guide we'll pick 100, but you can pick anything.

For the `owner` you can get the account addresses in your sandbox by running:

```bash
aztec-cli get-accounts
```

This will return something like this:

```bash

```

Use one of these `address`es as the `owner`. You can either copy it or export.

To deploy the counter contract, [ensure the sandbox is running](../cli/sandbox-reference.md) and run this in the root of your nargo project:

```bash
aztec-cli deploy target/Counter.json --args 100 0x25048e8c1b7dea68053d597ac2d920637c99523651edfb123d0632da785970d0
```

You can also test the functions by applying what you learned in the [quickstart](./quickstart.md).

Congratulations, you have now written, compiled, and deployed your first Aztec.nr smart contract!

## What's next?

Now you can explore.

**Interested in learning more about how Aztec works under the hood?**

Understand the high level architecture [here](../../concepts/foundation/main.md).

**Want to write more advanced smart contracts?**

Follow the token contract tutorial [here](../tutorials/writing_token_contract.md).

**Ready to dive into Aztec and Ethereum cross-chain communication?**

Read the [Portals page](../../concepts/foundation/communication/cross_chain_calls.md) and learn how to practically implement portals in the [token bridge tutorial](../tutorials/token_portal/main.md).
