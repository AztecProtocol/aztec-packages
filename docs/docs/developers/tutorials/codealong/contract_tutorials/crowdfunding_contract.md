---
title: "Crowdfunding contract"
sidebar_position: 3
tags: [developers, tutorial, example]
---

# Write a donations contract

In this tutorial we'll create two contracts related to crowdfunding:

- A crowdfunding contract with two core components
  - Fully private donations
  - Verifiable withdrawals to the operator
- A reward contract for anyone else to anonymously reward donors

Along the way you will:

- Install Aztec developer tools
- Setup a new Noir contract project
- Add base Aztec dependencies
- Call between private and public contexts
- Wrap an address with its interface (token)
- Create custom private value notes

This tutorial is compatible with the Aztec version `#include_aztec_version`. Install the correct version with `aztec-up -v #include_version_without_prefix`. Or if you'd like to use a different version, you can find the relevant tutorial by clicking the version dropdown at the top of the page.

## Setup

### Install tools

Please ensure that you already have [Installed the Sandbox](../../../getting_started)

### Create an Aztec project

Use `aztec-nargo` in a terminal to create a new Aztec contract project named "crowdfunding":

```sh
aztec-nargo new --contract crowdfunding
```

Inside the new `crowdfunding` directory you will have a base to implement the Aztec smart contract.

Use `aztec-nargo --help` to see other commands.

## Private donations

1. An "Operator" begins a Crowdfunding campaign (contract), specifying:

- an existing token address
- their account address
- a deadline timestamp

2. Any address can donate (in private context)

- private transfer token from sender to contract
- transaction receipts allow private claims via another contract

3. Only the operator can withdraw from the fund

### 1. Create a campaign

#### Initialize

Open the project in your preferred editor. If using VSCode and the LSP, you'll be able to select the `aztec-nargo` binary to use (instead of `nargo`).

In `main.nr`, rename the contract from `Main`, to `Crowdfunding`.

```rust
#include_code empty-contract /noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/main.nr raw
}
```

Replace the example functions with an initializer that takes the required campaign info as parameters. Notice use of `#[aztec(...)]` macros inform the compiler that the function is a public initializer.

```rust
#include_code init-header /noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/main.nr raw
  //...
}
```

#### Dependencies

When you compile the contracts by running `aztec-nargo compile` in your project directory, you'll notice it cannot resolve `AztecAddress`. (Or hovering over in VSCode)

```rust
#include_code init-header-error /noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/main.nr raw
  //...
}
```

Add the required dependency by going to your project's `Nargo.toml` file, and adding `aztec` from the `aztec-nr` framework. It resides in the `aztec-packages` mono-repo:

```rust
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/aztec" }
uint_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/uint-note" }
router = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/noir-contracts/contracts/protocol/router_contract" }
```

This snippet also imports some of the other dependencies we will be using.

A word about versions:

- Choose the aztec packages version to match your aztec sandbox version
- Check that your `compiler_version` in Nargo.toml is satisfied by your aztec compiler - `aztec-nargo -V`

Inside the Crowdfunding contract definition, use the dependency that defines the address type `AztecAddress` (same syntax as Rust)

```rust
use dep::aztec::protocol_types::address::AztecAddress;
```

The `aztec::protocol_types` can be browsed [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-protocol-circuits/crates/types/src). And like rust dependencies, the relative path inside the dependency corresponds to `address::AztecAddress`.

This contract uses another file called `config.nr`. Create this in the same directory as `main.nr` and paste this in:

#include_code config.nr noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/config.nr rust

#### Storage

To retain the initializer parameters in the contract's Storage, we'll need to declare them in a preceding `Storage` struct in our `main.nr`:

#include_code storage /noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/main.nr rust

Now complete the initializer by setting the storage variables with the parameters:

#include_code init /noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/main.nr rust

### 2. Taking private donations

#### Checking campaign duration against the timestamp

To check that the donation occurs before the campaign deadline, we must access the public `timestamp`. It is one of several public global variables.

We read the deadline from public storage in private and use the router contract to assert that the current `timestamp` is before the deadline.

#include_code call-check-deadline /noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/main.nr rust

We perform this check via the router contract to not reveal which contract is performing the check - this is achieved by calling a private function on the router contract which then enqueues a call to a public function on the router contract. The result is that `msg_sender` in the public call will then be the router contract.
Note that the privacy here is dependent upon what deadline value is chosen by the Crowdfunding contract deployer.
If it's unique to this contract, then there'll be a privacy leak regardless, as third parties will be able to observe a deadline check against the Crowdfunding deadline, and therefore infer that the associated transaction is interacting with it.

Now conclude adding all dependencies to the `Crowdfunding` contract:

#include_code all-deps /noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/main.nr rust

Like before, you can find these and other `aztec::protocol_types` [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-protocol-circuits/crates/types/src).

#### Interfacing with another contract

The token being used for donations is stored simply as an `AztecAddress` (named `donation_token`). so to easily use it as a token, we let the compiler know that we want the address to have a Token interface. Here we will use a maintained example Token contract.

Add this `Token` contract to Nargo.toml:

```
token = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/noir-contracts/contracts/app/token_contract" }
```

With the dependency already `use`d at the start of the contract, the token contract can be called to make the transfer from msg sender to this contract.

#### Creating and storing a private receipt note

The last thing to do is create a new value note and add it to the `donation_receipts`. So the full donation function is now

#include_code donate /noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/main.nr rust

### 3. Operator withdrawals

The remaining function to implement, `withdraw`, is reasonably straight-forward:

1. make sure the address calling is the operator address
2. transfer tokens from the contract to the operator
3. reveal that an amount has been withdrawn to the operator

The last point is achieved by emitting an unencrypted event log.

Copy the last function into your Crowdfunding contract:

#include_code operator-withdrawals /noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/main.nr rust

This is emitting an event, which we will need to create. Paste this earlier in our contract after our `Storage` declaration:

#include_code withdrawal-processed-event /noir-projects/noir-contracts/contracts/app/crowdfunding_contract/src/main.nr rust

You should be able to compile successfully with `aztec-nargo compile`.

**Congratulations,** you have just built a multi-contract project on Aztec!

## Conclusion

For comparison, the full Crowdfunding contract can be found [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-contracts/contracts/app/crowdfunding_contract).

If a new token wishes to honour donors with free tokens based on donation amounts, this is possible via the donation_receipts (a `PrivateSet`).
See [claim_contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-contracts/contracts/claim_contract).

## Next steps

### Build an accounts contract

Follow the account contract tutorial on the [next page](./write_accounts_contract.md) and learn more about account abstraction.

### Optional: Learn more about concepts mentioned here

- [Initializer functions](../../../guides/smart_contracts/writing_contracts/initializers.md)
- [Versions](../../../guides/local_env/versions-updating.md).
- [Authorizing actions](../../../../aztec/concepts/advanced/authwit.md)
- [Public logs](../../../guides/smart_contracts/writing_contracts/how_to_emit_event.md)
