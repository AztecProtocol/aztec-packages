---
title: Build a donations contract
tags: [developers, tutorial, example]
---

In this tutorial we'll create two contracts related to crowdfunding:

- A crowdfunding contract with two core components
  - Fully private donations
  - Verifiable withdrawals to the operator
- A reward contract for anyone else to anonymously reward donors

Along the way you will:

- Install Aztec developer tools
- Setup a new Noir contract project
- Add base Aztec dependencies
-

## Setup

### Install tools

Please ensure that the you already have [Installed the Sandbox](https://docs.aztec.network/developers/getting_started/quickstart#install-the-sandbox).

And if using VSCode, see [here](https://docs.aztec.network/developers/contracts/main#install-noir-lsp-recommended) to install Noir LSP and select `aztec-nargo`.

### Create an Aztec project

Create a new Aztec contract project named "crowdfunding":

```sh
aztec-nargo new --contract crowdfunding
```

Inside the new `crowdfunding` directory you will have a base to implement the Aztec smart contract.

## Private donations

1. An "Operator" begins a Crowdfunding campaign (contract), specifying:

- an existing token address
- their account address
- a deadline timestamp

2. Any address can donate (in private context)

- private transfer token from sender to contract
- privately note amount donated (claimable via other contract)

3. Only the operator can withdraw from fund

### 1. Create a campaign

#### Initialize

Rename the contract from `Main`, to `Crowdfunding`.

#include_code empty-contract /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr rust

Replace the example functions with an initializer that takes the required campaign info as parameters. Notice use of `#[aztec(...)]` macros inform the compiler that the function is a public initializer.

```rust
#include_code init-header /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr raw
  //...
}
```

More about initializers [here](../../contracts/writing_contracts/functions/initializers.md).

#### Dependencies

When you compile the contracts by running `aztec-nargo compile` in your project directory, you'll notice it cannot resolve `AztecAddress`. (Or hovering over in VSCode)

```rust
#include_code init-header-error /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr raw
  //...
}
```

Add the required dependency by going to your project's `Nargo.toml` file, and adding `aztec` from the `aztec-nr` framework. It resides in the `aztec-packages` mono-repo:

```rust
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/aztec" }
```

A word about versions:
- Choose the aztec packages version to match your aztec tools as seen here - `aztec-cli -V`
- Check that your `compiler_version` in Nargo.toml is satisified by your aztec compiler - `aztec-nargo -V`

More about versions [here](https://docs.aztec.network/developers/versions-updating).

Inside the Crowdfunding contract definition, use the dependency that defines the address type `AztecAddress`

```rust
use dep::aztec::protocol_types::address::AztecAddress;
```

The `aztec::protocol_types` can be browsed [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-protocol-circuits/crates/types/src).

#### Storage

To retain the initializer parameters in the contract's Storage, we'll need to declare them in a preceding `Storage` struct:

#include_code storage /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr rust

There is an additional type, `ValueNote` that we will use later, so also include this at the start of your contract

```rust
use dep::value_note::value_note::ValueNote;
```

This dependency is from the top-level of the Aztec.nr framework, namely [noir-projects/aztec-nr](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/value-note/src/value_note.nr)

Now complete the initializer by setting the storage variables with the parameters:

#include_code init /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr rust

### 2. Taking private donations

#### Checking campaign duration against the timestamp

To check that the donation occurs before the campaign deadline, we must access the public `timestamp`. It is one of several [Public Global Variables](https://docs.aztec.network/developers/contracts/references/globals#public-global-variables).

Declare a public (internal) function

```rust
#include_code deadline-header /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr raw
    //...
}
```

Read the deadline from storage and assert that the `timestamp` from this context is before the deadline

#include_code deadline /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr rust


Since donations are private, they will have the user's private context which has these [Private Global Variables](https://docs.aztec.network/developers/contracts/references/globals#private-global-variables). So from the private context we must do some extra work to call the (public internal) `_check_deadline` function.

```rust
#include_code call-check-deadline /noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr raw
  //...
}
```

From the private context we call `call_public_function` (defined in [private_context.nr](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr/aztec/src/context) ~[here](https://docs.aztec.network/developers/contracts/references/aztec-nr/aztec/context/private_context#call_public_function)~). Passing the address of the contract and the function signature (name and param types).

We've not yet added the `FunctionSelector` type, so do that now

```rust
use dep::aztec::{protocol_types::{address::AztecAddress, abis::function_selector::FunctionSelector}};
```

Like before, you can find the `FunctionSelector`, and other `aztec::protocol_types` [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-protocol-circuits/crates/types/src).


#### Simplified interface for tokens

Note: requires auth-wit of token


## Implement Rewards

Continue building a complementary rewards contract [here](./rewards.md).

```

```
