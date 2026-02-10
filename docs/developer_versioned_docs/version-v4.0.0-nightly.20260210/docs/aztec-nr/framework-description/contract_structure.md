---
title: Contract Structure
sidebar_position: 1
tags: [contracts]
description: Learn the fundamental structure of Aztec smart contracts including the contract keyword, directory layout, and how contracts manage state and functions.
references: ["docs/examples/contracts/counter_contract/src/main.nr"]
---

High-level structure of how Aztec smart contracts including the different components.

## Directory structure

Here's a common layout for a basic Aztec.nr Contract project:

```text title="layout of an aztec contract project"
─── my_aztec_contract_project
       ├── src
       │     └── main.nr       <-- your contract
       └── Nargo.toml          <-- package and dependency management
```

See the vanilla Noir docs for [more info on packages](https://noir-lang.org/docs/noir/modules_packages_crates/crates_and_packages).

## Contract block

All contracts start with importing the required files and declaring a contract using the `contract` keyword:

```rust
// import the `aztec` macro from Aztec.nr
use aztec::macros::aztec;

// use the 'contract' keyword to declare a contract, applying the `aztec` macro
#[aztec]
pub contract MyContract {
    // contract code here
}
```

By convention, contracts are named in `PascalCase`.

The `#[aztec]` macro performs a lot of the low-level operations required to take a circuit language like Noir and build smart contracts out of it - including automatically creating external interfaces, inserting standard contract functions, etc. **All Aztec smart contracts must have this macro applied to them.**

**Note:** each Noir crate (package) can only have _a single_ contract. If you are writing a multi-contract system, then each of them needs to be in their own separate crate. To learn more about crates and packages, visit the [Noir documentation](https://noir-lang.org/docs/noir/modules_packages_crates/crates_and_packages).

## Imports

Aside from the [`#[aztec]`](pathname:///aztec-nr-api/nightly/noir_aztec/macros/aztec/fn.aztec) macro import, all other imports need to go _inside_ the `contract` block - this is because `contract` acts like `mod`, creating a new [module](https://noir-lang.org/docs/noir/modules_packages_crates/modules).

```rust
use aztec::macros::aztec;

#[aztec]
pub contract MyContract {
    // other imports go here
    use aztec::state_vars::{PrivateMutable, PrivateSet};
}
```

**Note:** [Noir's VSCode extension](../installation) is able to take care of most imports and put them in the correct place automatically.

## State Variables

With the boilerplate out of the way, it is now the time to begin defining the contract logic. It is recommended to start development by understanding the shape the _state_ of the contract will have:
- Which values will be private?
- Which will be public?
- What properties are required (is mutability or immutability needed? Is there a single global value, like a token total supply, or does each user get one, like a balance?).

In Solidity, this is done by simply declaring variables inside of the contract, like so:

```solidity
contract MyContract {
    uint128 public my_public_state_variable;
}
```

In Aztec, defining state requires a few more steps, as there are both private and public variables (where these keywords refer to the privacy of the variable rather than their accessibility), and multiple _kinds_ of state variables.

We define state using a [`struct`](https://noir-lang.org/docs/noir/concepts/data_types/structs) that will hold the entire contract state. We call this struct _the storage struct_, and each variable inside this struct is called [_a state variable_.](./state_variables)

```rust
use aztec::macros::aztec;

#[aztec]
pub contract MyContract {
    use aztec::{
        macros::storage,
        state_vars::{PrivateMutable, PublicMutable}
    };

    // The storage struct can have any name, but is typically called `Storage`. It must have the `#[storage]` macro applied to it.
    // This struct must also have a generic type called C or Context.
    #[storage]
    struct Storage<Context> {
        // A private numeric value which can change over time. This value will be hidden, and only those with the secret can know its current value.
        my_private_state_variable: Owned<PrivateMutable<NoteType, Context>>,
        // A public numeric value which can change over time. This value will be known to everyone and is equivalent to the Solidity example above.
        my_public_state_variable: PublicMutable<u128, Context>,
    }
}
```

## Events

Like Solidity contracts, Aztec contracts can define events to notify that some state has changed. However, in Aztec, events can also be emitted privately, in which case only some users will learn of the event.

[Events](./how_to_emit_event.md) are a struct marked with the `#[event]` macro:

```rust
#[event]
struct Transfer {
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
}
```

## Functions

Contracts are interacted with by invoking their `external` [functions](./functions/index.md). There are three kinds of `external` functions:

- External **private** functions, which reveal nothing about their execution and are executed off chain on the user's device, producing a zero-knowledge proof of execution that is sent to the network as part of a transaction.
- External **public** functions, which nodes in the network invoke publicly (like any `external` Solidity contract function).
- External **utility** functions, which are executed off chain on the user's device by applications in order to display useful information, e.g. retrieve contract state. These are never part of a transaction.

```rust
use aztec::macros::aztec;

#[aztec]
contract MyContract {
    use aztec::macros::functions::external;

    #[external("private")]
    fn my_private_function(parameter_a: u128, parameter_b: AztecAddress) {
        // ...
    }

    #[external("public")]
    fn my_public_function(parameter_a: u128, parameter_b: AztecAddress) {
        // ...
    }

    #[external("utility")]
    fn my_utility_function(parameter_a: u128, parameter_b: AztecAddress) {
        // ...
    }
}
```

Contracts can also define `internal` functions, which cannot be called by other contracts (like any `internal` Solidity function). These exist to help organize your code, reuse functionality, etc.

### Current Limitations

All `#[external]` contract functions must be defined _directly inside the `contract` block_, that is, in the same file. It is possible to define `#[internal]` and helper functions in `mod`s in other files, but not `#[external]` functions.

**Noir does not feature inheritance** nor is there currently any other mechanism to extend and reuse contract logic. For example, you cannot take a token contract and extend it to add minting functionality, or reuse it in a liquidity pool. Like Vyper, the entire logic must live in a single file.

We expect to lift some of these restrictions sometime after the release of Noir 1.0.

## Next steps

- [Define functions](./functions/index.md) - Learn about private, public, and utility functions
- [Define storage](./state_variables.md) - Work with persistent state variables
- [Compile your contract](../how_to_compile_contract.md) - Build your contract artifact
