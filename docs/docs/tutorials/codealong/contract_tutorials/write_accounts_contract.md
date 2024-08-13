---
title: Account Contract
sidebar_position: 4
tags: [accounts]
---

This tutorial will take you through the process of writing your own account contract in Aztec.nr, along with the Typescript glue code required for using it within a wallet.

You will learn:

- How to write a custom account contract in Aztec.nr
- The entrypoint function for transaction authentication and call execution
- The AccountActions module and entrypoint payload structs, necessary inclusions for any account contract
- Customizing authorization validation within the `is_valid` function (using Schnorr signatures as an example)
- Typescript glue code to format and authenticate transactions
- Deploying and testing the account contract

Writing your own account contract allows you to define the rules by which user transactions are authorized and paid for, as well as how user keys are managed (including key rotation and recovery). In other words, writing an account contract lets you make the most out of account abstraction in the Aztec network.

It is highly recommended that you understand how an [account](../../../aztec/concepts/accounts/index.md) is defined in Aztec, as well as the differences between privacy and authentication [keys](../../../aztec/concepts/accounts/keys.md). You will also need to know how to write a contract in Noir, as well as some basic [Typescript](https://www.typescriptlang.org/).

For this tutorial, we will write an account contract that uses Schnorr signatures for authenticating transaction requests.

Every time a transaction payload is passed to this account contract's `entrypoint` function, the account contract requires a valid Schnorr signature, whose signed message matches the transaction payload, and whose signer matches the account contract owner's public key. If the signature fails, the transaction will fail.

For the sake of simplicity, we will hardcode the signing public key into the contract, but you could store it [in a private note](../../../aztec/concepts/accounts/keys.md#using-a-private-note), [in an immutable note](../../../aztec/concepts/accounts/keys.md#using-an-immutable-private-note), or [on a separate keystore](../../../aztec/concepts/accounts/keys.md#using-a-separate-keystore), to mention a few examples.

## Contract

Let's start with the account contract itself in Aztec.nr. Create a new Aztec.nr contract project that will contain a file with the code for the account contract, with a hardcoded public key:

#include_code contract noir-projects/noir-contracts/contracts/schnorr_hardcoded_account_contract/src/main.nr rust

The important part of this contract is the `entrypoint` function, which will be the first function executed in any transaction originated from this account. This function has two main responsibilities: authenticating the transaction and executing calls. It receives a `payload` with the list of function calls to execute, and requests a corresponding authentication witness from an oracle to validate it. Authentication witnesses are used for authorizing actions for an account, whether it is just checking a signature, like in this case, or granting authorization for another account to act on an accounts behalf (e.g. token approvals). You will find this logic implemented in the `AccountActions` module, which use the `AppPayload` and `FeePayload` structs:

#include_code entrypoint noir-projects/aztec-nr/authwit/src/account.nr rust

#include_code app-payload-struct noir-projects/aztec-nr/authwit/src/entrypoint/app.nr rust

#include_code fee-payload-struct noir-projects/aztec-nr/authwit/src/entrypoint/fee.nr rust

:::info
Using the `AccountActions` module and the payload structs is not mandatory. You can package the instructions to be carried out by your account contract however you want. However, using these modules can save you a lot of time when writing a new account contract, both in Noir and in Typescript.
:::

The `AccountActions` module provides default implementations for most of the account contract methods needed, but it requires a function for validating an auth witness. In this function you will customize how your account validates an action: whether it is using a specific signature scheme, a multi-party approval, a password, etc.

#include_code is-valid noir-projects/noir-contracts/contracts/schnorr_hardcoded_account_contract/src/main.nr rust

For our account contract, we will take the hash of the action to authorize, request the corresponding auth witness from the oracle, and validate it against our hardcoded public key. If the signature is correct, we authorize the action.

### Fee Abstraction

The `FeePayload`, being distinct from the `AppPayload`, allows for fee abstraction, meaning the account paying the fee for the transaction can be different than the account that is initiating the transaction. This is also useful for maintaining privacy, as fee payments on the network must be public. For example, Alice could pay a relayer transaction fees in private, and the relayer could pay the transaction fee in public. This also allows for accounts without Fee Juice to use another asset to pay for fees, provided they can find a relayer willing to accept the asset as payment (or do it for free).

### Nonce Abstraction

The protocol enforces uniqueness of transactions by checking that the transaction hash is unique. Transactions with the same transaction hash will be rejected. Handling transaction ordering via nonces is left to the account contract implementation. Account contracts can require incremental nonces, or have no requirements at all and not enforce transaction ordering.

A side-effect of not having nonces at the protocol level is that it is not possible to cancel pending transactions by submitting a new transaction with higher fees and the same nonce.

## Typescript

Now that we have a valid account contract, we need to write the typescript glue code that will take care of formatting and authenticating transactions so they can be processed by our contract, as well as deploying the contract during account setup. This takes the form of implementing the `AccountContract` interface from `@aztec/aztec.js`:

#include_code account-contract-interface yarn-project/aztec.js/src/account/contract.ts typescript

However, if you are using the default `AccountActions` module, then you can leverage the `DefaultAccountContract` class from `@aztec/accounts` and just implement the logic for generating an auth witness that matches the one you wrote in Noir:

#include_code account-contract yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts typescript

As you can see in the snippet above, to fill in this base class, we need to define three things:

- The build artifact for the corresponding account contract.
- The deployment arguments.
- How to create an auth witness.

In our case, the auth witness will be generated by Schnorr-signing over the message identifier using the hardcoded key. To do this, we are using the `Schnorr` signer from the `@aztec/circuits.js` package to sign over the payload hash. This signer maps to exactly the same signing scheme that Noir's standard library expects in `schnorr::verify_signature`.

:::info
More signing schemes are available in case you want to experiment with other types of keys. Check out Noir's [documentation on cryptographic primitives](https://noir-lang.org/docs/noir/standard_library/cryptographic_primitives).
:::

## Trying it out

Let's try creating a new account backed by our account contract, and interact with a simple token contract to test it works.

To create and deploy the account, we will use the `AccountManager` class, which takes an instance of an Private Execution Environment (PXE), a [privacy private key](../../../aztec/concepts/accounts/keys.md#incoming-viewing-keys), and an instance of our `AccountContract` class:

#include_code account-contract-deploy yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts typescript

Note that we get a `Wallet` instance out of the account, which we can use for initializing the token contract class after deployment, so any transactions sent to it are sent from our wallet. We can then send a transaction to it and check its effects:

#include_code account-contract-works yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts typescript

If we run this, we get `Balance of wallet is now 150`, which shows that the `mint` call was successfully executed from our account contract.

To make sure that we are actually validating the provided signature in our account contract, we can try signing with a different key. To do this, we will set up a new `Account` instance pointing to the contract we already deployed but using a wrong signing key:

#include_code account-contract-fails yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts typescript

Lo and behold, we get `Error: Assertion failed: 'verification == true'` when running the snippet above, pointing to the line in our account contract where we verify the Schnorr signature.

## Next Steps

### Build a hybrid token tutorial

Follow the token contract tutorial on the [next page](./token_contract.md) and learn more about hybrid state.

### Optional: Learn more about concepts mentioned here

- [ECDSA signer account contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-contracts/contracts/ecdsa_account_contract/src/main.nr)
- [Schnorr signer account contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/schnorr_account_contract)
- [Account abstraction](../../../aztec/concepts/accounts/index.md#what-is-account-abstraction)
- [Authentication witness](../../../aztec/concepts/accounts/authwit.md)
- [Fee abstraction](../../../protocol-specs/gas-and-fees/tx-setup-and-teardown.md).
