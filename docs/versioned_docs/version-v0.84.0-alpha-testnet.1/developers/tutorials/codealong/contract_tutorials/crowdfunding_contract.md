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

```rust title="empty-contract" showLineNumbers
use dep::aztec::macros::aztec;

#[aztec]
pub contract Crowdfunding {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L3-L8" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L3-L8</a></sub></sup>


Replace the example functions with an initializer that takes the required campaign info as parameters. Notice use of `#[aztec(...)]` macros inform the compiler that the function is a public initializer.

```rust
#[public]
#[initializer]
fn init(donation_token: AztecAddress, operator: AztecAddress, deadline: u64) {
  //...
}
```

#### Dependencies

When you compile the contracts by running `aztec-nargo compile` in your project directory, you'll notice it cannot resolve `AztecAddress`. (Or hovering over in VSCode)

```rust
#[public]
#[initializer]
// this-will-error
fn init(donation_token: AztecAddress, operator: AztecAddress, deadline: u64) {
  //...
}
```

Add the required dependency by going to your project's `Nargo.toml` file, and adding `aztec` from the `aztec-nr` framework. It resides in the `aztec-packages` mono-repo:

```rust
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v0.84.0-alpha-testnet.1", directory="noir-projects/aztec-nr/aztec" }
```

A word about versions:

- Choose the aztec packages version to match your aztec sandbox version
- Check that your `compiler_version` in Nargo.toml is satisfied by your aztec compiler - `aztec-nargo -V`

Inside the Crowdfunding contract definition, use the dependency that defines the address type `AztecAddress` (same syntax as Rust)

```rust
use dep::aztec::protocol_types::address::AztecAddress;
```

The `aztec::protocol_types` can be browsed [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-protocol-circuits/crates/types/src). And like rust dependencies, the relative path inside the dependency corresponds to `address::AztecAddress`.

#### Storage

To retain the initializer parameters in the contract's Storage, we'll need to declare them in a preceding `Storage` struct:

```rust title="storage" showLineNumbers
#[storage]
struct Storage<Context> {
    config: PublicImmutable<Config, Context>,
    // Notes emitted to donors when they donate (can be used as proof to obtain rewards, eg in Claim contracts)
    donation_receipts: PrivateSet<UintNote, Context>,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L38-L45" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L38-L45</a></sub></sup>


The `ValueNote` type is in the top-level of the Aztec.nr framework, namely [noir-projects/aztec-nr (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/aztec-nr/value-note/src/value_note.nr). Like before, you'll need to add the crate to Nargo.toml

---

Back in main.nr, reference `use` of the type

```rust
use dep::value_note::value_note::ValueNote;
```

Now complete the initializer by setting the storage variables with the parameters:

```rust title="init" showLineNumbers
#[public]
#[initializer]
fn init(donation_token: AztecAddress, operator: AztecAddress, deadline: u64) {
    storage.config.initialize(Config { donation_token, operator, deadline });
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L48-L59" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L48-L59</a></sub></sup>


You can compile the code so far with `aztec-nargo compile`.

### 2. Taking private donations

#### Checking campaign duration against the timestamp

To check that the donation occurs before the campaign deadline, we must access the public `timestamp`. It is one of several public global variables.

We read the deadline from public storage in private and use the router contract to assert that the current `timestamp` is before the deadline.

```rust title="call-check-deadline" showLineNumbers
privately_check_timestamp(Comparator.LT, config.deadline, &mut context);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L68-L70" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L68-L70</a></sub></sup>


We perform this check via the router contract to not reveal which contract is performing the check - this is achieved by calling a private function on the router contract which then enqueues a call to a public function on the router contract. The result is that `msg_sender` in the public call will then be the router contract.
Note that the privacy here is dependent upon what deadline value is chosen by the Crowdfunding contract deployer.
If it's unique to this contract, then there'll be a privacy leak regardless, as third parties will be able to observe a deadline check against the Crowdfunding deadline, and therefore infer that the associated transaction is interacting with it.

Now conclude adding all dependencies to the `Crowdfunding` contract:

```rust title="all-deps" showLineNumbers
use dep::aztec::{
    messages::logs::note::encode_and_encrypt_note,
    event::event_interface::EventInterface,
    macros::{
        events::event,
        functions::{initializer, internal, private, public},
        storage::storage,
    },
    prelude::{AztecAddress, PrivateSet, PublicImmutable},
    protocol_types::traits::{Serialize, ToField},
    unencrypted_logs::unencrypted_event_emission::encode_event,
    utils::comparison::Comparator,
};
use dep::uint_note::uint_note::UintNote;
use router::utils::privately_check_timestamp;
use std::meta::derive;
use token::Token;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L11-L29" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L11-L29</a></sub></sup>


Like before, you can find these and other `aztec::protocol_types` [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-protocol-circuits/crates/types/src).

#### Interfacing with another contract

The token being used for donations is stored simply as an `AztecAddress` (named `donation_token`). so to easily use it as a token, we let the compiler know that we want the address to have a Token interface. Here we will use a maintained example Token contract.

Add this `Token` contract to Nargo.toml:

```
token = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v0.84.0-alpha-testnet.1", directory="noir-projects/noir-contracts/contracts/token_contract" }
```

With the dependency already `use`d at the start of the contract, the token contract can be called to make the transfer from msg sender to this contract.

#### Creating and storing a private receipt note

The last thing to do is create a new value note and add it to the `donation_receipts`. So the full donation function is now

```rust title="donate" showLineNumbers
#[private]
fn donate(amount: u128) {
    let config = storage.config.read();

    // 1) Check that the deadline has not passed --> we do that via the router contract to conceal which contract
    // is performing the check.
    privately_check_timestamp(Comparator.LT, config.deadline, &mut context);

    // 2) Transfer the donation tokens from donor to this contract
    let donor = context.msg_sender();
    Token::at(config.donation_token)
        .transfer_in_private(donor, context.this_address(), amount, 0)
        .call(&mut context);

    // 3) Create a value note for the donor so that he can later on claim a rewards token in the Claim
    // contract by proving that the hash of this note exists in the note hash tree.
    let note = UintNote::new(amount, donor);

    storage.donation_receipts.insert(note).emit(encode_and_encrypt_note(
        &mut context,
        donor,
        donor,
    ));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L61-L90" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L61-L90</a></sub></sup>


### 3. Operator withdrawals

The remaining function to implement, `withdraw`, is reasonably straight-forward:

1. make sure the address calling is the operator address
2. transfer tokens from the contract to the operator
3. reveal that an amount has been withdrawn to the operator

The last point is achieved by emitting an unencrypted event log.

Copy the last function into your Crowdfunding contract:

```rust title="operator-withdrawals" showLineNumbers
// Withdraws balance to the operator. Requires that msg_sender() is the operator.
#[private]
fn withdraw(amount: u128) {
    let config = storage.config.read();
    let operator_address = config.operator;

    // 1) Check that msg_sender() is the operator
    assert(context.msg_sender() == operator_address, "Not an operator");

    // 2) Transfer the donation tokens from this contract to the operator
    Token::at(config.donation_token).transfer(operator_address, amount).call(&mut context);
    // 3) Emit a public event so that anyone can audit how much the operator has withdrawn
    Crowdfunding::at(context.this_address())
        ._publish_donation_receipts(amount, operator_address)
        .enqueue(&mut context);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L92-L109" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/crowdfunding_contract/src/main.nr#L92-L109</a></sub></sup>


You should be able to compile successfully with `aztec-nargo compile`.

**Congratulations,** you have just built a multi-contract project on Aztec!

## Conclusion

For comparison, the full Crowdfunding contract can be found [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-contracts/contracts/crowdfunding_contract).

If a new token wishes to honour donors with free tokens based on donation amounts, this is possible via the donation_receipts (a `PrivateSet`).
See [claim_contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v0.84.0-alpha-testnet.1/noir-projects/noir-contracts/contracts/claim_contract).

## Next steps

### Build an accounts contract

Follow the account contract tutorial on the [next page](./write_accounts_contract.md) and learn more about account abstraction.

### Optional: Learn more about concepts mentioned here

 - [Initializer functions](../../../guides/smart_contracts/writing_contracts/initializers.md)
 - [Versions](../../../guides/local_env/versions-updating.md).
 - [Authorizing actions](../../../../aztec/concepts/advanced/authwit.md)
 - [Public logs](../../../guides/smart_contracts/writing_contracts/how_to_emit_event.md)
