---
title: Authentication Witness
description: Developer Documentation to use Authentication Witness for authentication actions on Aztec.
tags: [accounts, authwit]
---

This page introduces the authwit library and how you can use it in your Aztec.nr smart contracts. [Skip to the usage](#usage).

For a guide on using authwit in Aztec.js, [read this](../../js_apps/authwit.md).

## Prerequisite reading

- [Authwit](../../../../aztec/concepts/accounts/authwit.md)

## Introduction

Authentication Witness is a scheme for authentication actions on Aztec, so users can allow third-parties (eg protocols or other users) to execute an action on their behalf.

How it works logically is explained in the [concepts](../../../../aztec/concepts/accounts/authwit.md) but we will do a short recap here.

An authentication witness is defined for a specific action, such as allowing a Defi protocol to transfer funds on behalf of the user. An action is here something that could be explained as `A is allowed to perform X operation on behalf of B` and we define it as a hash computed as such:

```rust
authentication_witness_action = H(
    caller: AztecAddress,
    contract: AztecAddress,
    selector: Field,
    argsHash: Field
);

// Example action that authenticates:
// defi contract to transfer 1000 tokens to itself on behalf of alice_account
authentication_witness_action = H(
  defi,
  token,
  transfer_selector,
  H(alice_account, defi, 1000)
);
```

Given the action, the developer can ask the `on_behalf_of` account contract if the action is authenticated or not.

```mermaid
sequenceDiagram
    actor Alice
    participant AC as Alice Account
    participant Token
    Alice->>AC: Defi.deposit(Token, 1000);
    activate AC
    AC->>Defi: deposit(Token, 1000);
    activate Defi
    Defi->>Token: transfer(Alice, Defi, 1000);
    activate Token
    Token->>AC: Check if Defi may call transfer(Alice, Defi, 1000);
    AC-->>Alice: Please give me AuthWit for DeFi<br/> calling transfer(Alice, Defi, 1000);
    activate Alice
    Alice-->>Alice: Produces Authentication witness
    Alice-->>AC: AuthWit for transfer(Alice, Defi, 1000);
    AC->>Token: AuthWit validity
    deactivate Alice
    Token->>Token: throw if invalid AuthWit
    Token->>Token: transfer(Alice, Defi, 1000);
    Token->>Defi: success
    deactivate Token
    Defi->>Defi: deposit(Token, 1000);
    deactivate Defi
    deactivate AC
```

:::info
Note in particular that the request for a witness is done by the token contract, and the user will have to provide it to the contract before it can continue execution. Since the request is made all the way into the contract where it is to be used, we don't need to pass it along as an extra input to the functions before it which gives us a cleaner interface.
:::

As part of `AuthWit` we are assuming that the `on_behalf_of` implements the private function:

```rust
#[aztec(private)]
fn verify_private_authwit(inner_hash: Field) -> Field;
```

For public authwit, we have a shared registry that is used, there we are using a `consume` function.

Both return the value `0xabf64ad4` (`IS_VALID` selector) for a successful authentication, and `0x00000000` for a failed authentication. You might be wondering why we are expecting the return value to be a selector instead of a boolean. This is mainly to account for a case of selector collisions where the same selector is used for different functions, and we don't want an account to mistakenly allow a different function to be called on its behalf - it is hard to return the selector by mistake, but you might have other functions returning a bool.

## The `AuthWit` library.

As part of Aztec.nr, we are providing a library that can be used to implement authentication witness for your contracts.

This library also provides a basis for account implementations such that these can more easily implement authentication witness.

For our purposes here (not building a wallet), the most important part of the library is the `auth` utility which exposes a couple of helper methods for computing the action hash, retrieving witnesses, validating them and emitting the nullifier.

### General utilities

The primary general utility is the `compute_authwit_message_hash_from_call` function which computes the action hash from its components. This is useful for when you need to generate a hash that is not for the current call, such as when you want to update a public approval state value that is later used for [authentication in public](#updating-approval-state-in-noir). You can view the implementation of this function [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/authwit/src/auth.nr).

#### TypeScript utilities

To make it convenient to compute the message hashes in TypeScript, the `aztec.js` package includes a `computeAuthWitMessageHash` function that you can use. Implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec.js/src/utils/authwit.ts).

### Utilities for private calls

For private calls where we allow execution on behalf of others, we generally want to check if the current call is authenticated by `on_behalf_of`. To easily do so, we can use the `assert_current_call_valid_authwit` which fetches information from the current context without us needing to provide much beyond the `on_behalf_of`.

This function will then make a call to `on_behalf_of` to execute the `verify_private_authwit` function which validates that the call is authenticated.
The `on_behalf_of` should assert that we are indeed authenticated and then return the `IS_VALID` selector. If the return value is not as expected, we throw an error. This is to cover the case where the `on_behalf_of` might implemented some function with the same selector as the `verify_private_authwit` that could be used to authenticate unintentionally.

#### Example

#include_code assert_current_call_valid_authwit /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

### Utilities for public calls

Very similar to the above, we have variations that work in the public domain (`assert_current_call_valid_authwit_public`). These functions are wrapped to give a similar flow for both cases, but behind the scenes the logic is slightly different since the public goes to the auth registry, while the private flow calls the account contract.

#### Example

#include_code assert_current_call_valid_authwit_public /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

## Usage

Ok, enough talking, how do we use this?

### Importing it

To add it to your project, add the `authwit` library to your `Nargo.toml` file.

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/aztec" }
authwit = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/authwit"}
```

Then you will be able to import it into your contracts as follows.

#include_code import_authwit /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

### Private Functions

#### Checking if the current call is authenticated

Based on the diagram earlier on this page let's take a look at how we can implement the `transfer` function such that it checks if the tokens are to be transferred `from` the caller or needs to be authenticated with an authentication witness.

#include_code transfer_from /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

The first thing we see in the snippet above, is that if `from` is not the call we are calling the `assert_current_call_valid_authwit` function from [earlier](#private-functions). If the call is not throwing, we are all good and can continue with the transfer.

In the snippet we are constraining the `else` case such that only `nonce = 0` is supported. This is not strictly necessary, but because I can't stand dangling useless values. By making it constrained, we can limit what people guess it does, I hope.

#### Authenticating an action in TypeScript

Cool, so we have a function that checks if the current call is authenticated, but how do we actually authenticate it? Well, assuming that we use a wallet that is following the spec, we import `computeAuthWitMessageHash` from `aztec.js` to help us compute the hash, and then we simply `addAuthWitness` to the wallet. Behind the scenes this will make the witness available to the oracle.

#include_code authwit_transfer_example /yarn-project/end-to-end/src/e2e_token_contract/transfer_private.test.ts typescript

Learn more about authwits in Aztec.js by [following this guide](../../js_apps/authwit.md).

### Public Functions

With private functions covered, how can we use this in a public function? Well, the answer is that we simply change one name of a function and then we are good to go :eyes: (almost).

#### Checking if the current call is authenticated

#include_code transfer_public /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

#### Authenticating an action in TypeScript

Authenticating an action in the public domain is slightly different from the private domain, since we are executing a function on the auth registry contract to add the witness flag. As you might recall, this was to ensure that we don't need to call into the account contract from public, which is a potential DOS vector.

In the snippet below, this is done as a separate contract call, but can also be done as part of a batch as mentioned in the [Accounts concepts](../../../../aztec/concepts/accounts/authwit.md#what-about-public).

#include_code authwit_public_transfer_example /yarn-project/end-to-end/src/e2e_token_contract/transfer_public.test.ts typescript

#### Updating approval state in Noir

We have cases where we need a non-wallet contract to approve an action to be executed by another contract. One of the cases could be when making more complex defi where funds are passed along. When doing so, we need the intermediate contracts to support approving of actions on their behalf.

This is fairly straight forward to do using the `auth` library which includes logic for updating values in the public auth registry. Namely, you can prepare the `message_hash` using `compute_authwit_message_hash_from_call` and then simply feed it into the `set_authorized` function (both are in `auth` library) to update the value. 

When another contract later is consuming the authwit using `assert_current_call_valid_authwit_public` it will be calling the registry, and spend that authwit.

An example of this would be our Uniswap example which performs a cross chain swap on L1. In here, we both do private and public auth witnesses, where the public is set by the uniswap L2 contract itself. In the below snippet, you can see that we compute the action hash and update the value in the registry. When we then call the `token_bridge` to execute afterwards, it reads this value, burns the tokens, and consumes the authentication.

#include_code authwit_uniswap_set /noir-projects/noir-contracts/contracts/uniswap_contract/src/main.nr rust

Outlining more of the `swap` flow: this simplified diagram shows how it will look for contracts that are not wallets but also need to support authentication witnesses.

```mermaid
sequenceDiagram
    actor A as Alice
    participant AC as Alice Account
    participant CC as Crosschain Swap
    participant TB as Token Bridge
    participant T as Token

    A->>AC: Swap 1000 token A to B on Uniswap L1
    activate AC;
    AC->>CC: Swap 1000 token A to B
    activate CC;
    CC->>T: unshield 1000 tokens from Alice Account to CCS
    activate T;
    T->>AC: Have you approved this??
    AC-->>A: Please give me an AuthWit
    A-->>AC: Here is AuthWit
    AC-->>AC: Validate AuthWit
    AC->>T: Yes
    deactivate T;
    CC-->>CC: Setting flag to true
    CC->>TB: Exit 1000 tokens to CCS
    activate TB;
    TB->>T: Burn 1000 tokens from CCS
    activate T;
    T->>CC: Have you approved this?
    CC->>T: Yes
    T-->>T: Burn
    Token->>Defi: success
    deactivate T;
    TB-->>TB: Emit L2->L1 message
    deactivate TB;
    CC-->>CC: Emit L2->L1 message
    deactivate CC;
    deactivate AC;
```

:::info **TODO**
Add a link to the blog-posts.
:::
