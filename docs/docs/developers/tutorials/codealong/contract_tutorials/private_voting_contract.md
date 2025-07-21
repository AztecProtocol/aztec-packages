---
title: "Private voting contract"
sidebar_position: 1
---

import Image from '@theme/IdealImage';

# Writing a private voting smart contract in Aztec.nr

In this tutorial we will go through writing a very simple private voting smart contract in Aztec.nr. You will learn about private functions, public functions, composability between them, state management and creatively using nullifiers to prevent people from voting twice!

This tutorial is compatible with the Aztec version `#include_aztec_version`. Install the correct version with `aztec-up -v #include_version_without_prefix`. Or if you'd like to use a different version, you can find the relevant tutorial by clicking the version dropdown at the top of the page.

We will build this:

<Image img={require('/img/tutorials/voting_flow.png')} />

- The contract will be initialized with an admin, stored publicly
- A voter can vote privately, which will call a public function and update the votes publicly
- The admin can end the voting period, which is a public boolean

To keep things simple, we won't create ballots or allow for delegate voting.

## Prerequisites

- You have followed the [quickstart](../../../getting_started.md) to install `aztec-nargo` and `aztec`.
- Running Aztec Sandbox

## Set up a project

First, create a new contract project with `aztec-nargo`.

```bash
aztec-nargo new --contract private_voting
```

Your file structure should look something like this:

```tree
.
| | |--private_voting
| | |  |--src
| | |  |  |--main.nr
| | |  |--Nargo.toml
```

The file `main.nr` will soon turn into our smart contract!

We will need the Aztec library to create this contract. In your `Nargo.toml` you should see `[dependencies]` - paste this below it.

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/aztec" }
```

## Initiate the contract and define imports

Go to `main.nr` and delete the sample code. Replace it with this contract initialization:

```rust
#include_code declaration noir-projects/noir-contracts/contracts/app/easy_private_voting_contract/src/main.nr raw
}
```

This defines a contract called `Voter`. Everything will sit inside this block.

Inside this, paste these imports:

#include_code imports noir-projects/noir-contracts/contracts/app/easy_private_voting_contract/src/main.nr rust

We are using various utils within the Aztec `prelude` library:

- `use dep::aztec::keys::getters::get_public_keys;`
  Imports a helper to retrieve public keys associated with the caller, used for computing a secure nullifier during voting.

- `use dep::aztec::macros::{functions::{initializer, internal, private, public, utility}, storage::storage};`
  Brings in macros for defining different function types (`initializer`, `internal`, `private`, `public`, `utility`) and for declaring contract storage via `storage`.

- `use dep::aztec::prelude::{AztecAddress, Map, PublicImmutable, PublicMutable};`
  Imports:

  - `AztecAddress`: a type for account/contract addresses,
  - `Map`: a key-value storage structure,
  - `PublicMutable`: public state that can be updated,
  - `PublicImmutable`: public state that is read-only after being set once.

- `use dep::aztec::protocol_types::traits::{Hash, ToField};`
  Provides the `Hash` and `ToField` traits, used for hashing values and converting them to a Field, used for nullifier creation and other computations.

## Set up storage

Under these imports, we need to set up our contract storage.
Define the storage struct like so:

#include_code storage_struct noir-projects/noir-contracts/contracts/app/easy_private_voting_contract/src/main.nr rust

In this contract, we will store three vars:

1. `admin`, as an Aztec address held in public state
2. `tally`, as a map with key as the persona and value as the number (in Field) held in public state
3. `vote_ended`, as a boolean held in public state
4. `active_at_block` specifies which block people can start voting. This variable specifies the block at which people must use their nullifier secret key to vote. Because nullifier keys are rotatable, if this is not included the same account would be able to vote more than once.

## Constructor

The next step is to initialize the contract with a constructor. The constructor will take an address as a parameter and set the admin.

#include_code constructor noir-projects/noir-contracts/contracts/app/easy_private_voting_contract/src/main.nr rust

This function takes the admin argument and writes it to the storage. We are also using this function to set the `vote_ended` boolean as false in the same way.

## Casting a vote privately

For the sake of simplicity, we will have three requirements:

1. Everyone with an Aztec account gets a vote
2. They can only vote once in this contract
3. Who they are is private, but their actual vote is not

To ensure someone only votes once, we will create a nullifier as part of the function call. If they try to vote again, the function will revert as it creates the same nullifier again, which can't be added to the nullifier tree (as that indicates a double spend).

Create a private function called `cast_vote`:

#include_code cast_vote noir-projects/noir-contracts/contracts/app/easy_private_voting_contract/src/main.nr rust

In this function, we do not create a nullifier with the address directly. This would leak privacy as it would be easy to reverse-engineer. We must add some randomness or some form of secret, like nullifier secrets.

To do this, we make an oracle call to fetch the caller's secret key, hash it to create a nullifier, and push the nullifier to Aztec.

After pushing the nullifier, we update the `tally` to reflect this vote. As we know from before, a private function cannot update public state directly, so we are calling a public function.

Create this new public function like this:

#include_code add_to_tally_public noir-projects/noir-contracts/contracts/app/easy_private_voting_contract/src/main.nr rust

The first thing we do here is assert that the vote has not ended.

`assert()` takes two arguments: the assertion, in this case that `storage.vote_ended` is not false, and the error thrown if the assertion fails.

The code after the assertion will only run if the assertion is true. In this snippet, we read the current vote tally at the `candidate`, add 1 to it, and write this new number to the `candidate`. The `Field` element allows us to use `+` to add to an integer.

## Getting the number of votes

We will create a function that anyone can call that will return the number of votes at a given vote Id. Paste this in your contract:

#include_code get_vote noir-projects/noir-contracts/contracts/app/easy_private_voting_contract/src/main.nr rust

We set it as `utility` because we don't intend to call this as part of a transaction: we want to call it from our application code to e.g. display the result in a UI.

## Allowing an admin to end a voting period

To ensure that only an `admin` can end a voting period, we can use another `assert()` statement.

Paste this function in your contract:

#include_code end_vote noir-projects/noir-contracts/contracts/app/easy_private_voting_contract/src/main.nr rust

Here, we are asserting that the `msg_sender()` is equal to the `admin` stored in public state.

## Compiling and codegen

The easiest way to compile the contract is with `aztec-nargo`. Run the following command in the directory with your Nargo.toml file:

```bash
aztec-nargo compile
```

This will create a new directory called `target` and a JSON artifact inside it.

Use `aztec codegen` to generate the Typescript artifact for the contract:

```bash
aztec codegen target --outdir src/artifacts
```

**Congratulations, you have written and compiled a private voting smart contract!** Once it is compiled you can deploy it to the sandbox!

## Next steps

### Learn how contracts can work together

Follow the crowdfunding contracts tutorial on the [next page](./crowdfunding_contract.md).

### Optional: Learn more about concepts mentioned here

- [Utility functions](../../../../aztec/smart_contracts/functions/attributes.md#utility-functions-utility).
- [Oracles](../../../../aztec/smart_contracts/oracles/index.md)
- [Nullifier secrets](../../../../aztec/concepts/accounts/keys.md#nullifier-keys).
- [How to deploy a contract to the sandbox](../../../guides/js_apps/deploy_contract.md)
