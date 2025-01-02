---
title: Keys
tags: [accounts, keys]
---

The goal of this section is to give app developer a good idea what keys there are used in the system.

In short, there is a **nullifier key** (to spend your notes), an **incoming viewing key** (to view any notes or logs that were sent to you), an **outgoing viewing key** (to view any logs or notes you sent to another entity), a **tagging key** (to quickly find notes relevant to you) and oftentimes a signing key. A signing key is not strictly required by the protocol, but are often used with specific account contracts for authorization purposes.

Each account in Aztec is backed by 4 key pairs:

- A **nullifier key pair** used for note nullifier computation, comprising the master nullifier secret key (`nsk_m`) and master nullifier public key (`Npk_m`).
- An **incoming viewing key pair** used to encrypt a note for the recipient, consisting of the master incoming viewing secret key (`ivsk_m`) and master incoming viewing public key (`Ivpk_m`).
- An **outgoing viewing key pair** used to encrypt a note for the sender, includes the master outgoing viewing secret key (`ovsk_m`) and master outgoing viewing public key (`Ovpk_m`).
- A **tagging key pair** used to compute tags in a tagging note discovery scheme, comprising the master tagging secret key (`tsk_m`) and master tagging public key (`Tpk_m`).

:::info
Key pairs are derived from a secret using a ZCash inspired scheme.
:::

:::note
Additionally, there is typically a signing key pair which is used for authenticating the owner of the account.
However, since Aztec supports native [account abstraction](../accounts/index.md#what-is-account-abstraction) this is not defined in protocol.
Instead it's up to the account contract developer to implement it.
:::

## Public keys retrieval

The keys for our accounts can be retrieved from the [Private eXecution Environment (PXE)](../pxe/index.md) using the following getter in Aztec.nr:

```
fn get_public_keys(account: AztecAddress) -> PublicKeys;
```

It is necessary to first register the user as an account in our PXE, by calling the `registerAccount` PXE endpoint using Aztec.js, providing the account's secret key and partial address.

During private function execution these keys are obtained via an oracle call from PXE.

## Scoped keys

To minimize damage of potential key leaks the keys are scoped (also called app-siloed) to the contract that requests them.
This means that the keys used for the same user in two different application contracts will be different and potential leak of the scoped keys would only affect 1 application.

This also allows per-application auditability.
A user may choose to disclose their incoming and outgoing viewing keys for a given application to an auditor or regulator (or for 3rd party interfaces, e.g. giving access to a block explorer to display my activity), as a means to reveal all their activity within that context, while retaining privacy across all other applications in the network.

In the case of nullifier keys, there is also a security reason involved.
Since the nullifier secret is exposed to the application contract to be used in the nullifier computation, the contract may accidentally or maliciously leak it.
If that happens, only the nullifier secret for that application is compromised (`nsk_app` and not `nsk_m`).

Above we mentioned that the notes typically contain `Npk_m`.
It might seem like a mistake given that the notes are nullified with `nsk_app`.
This is intentional and instead of directly trying to derive `Npk_m` from `nsk_app` we instead verify that both of the keys were derived from the same `nsk_m` in our protocol circuits.

## Protocol key types

All the keys below are Grumpkin keys (public keys derived on the Grumpkin curve).

## Nullifier keys

Whenever a note is consumed, a nullifier deterministically derived from it is emitted.
This mechanisms prevents double-spends, since nullifiers are checked by the protocol to be unique.
Now, in order to preserve privacy, a third party should not be able to link a note hash to its nullifier - this link is enforced by the note implementation.
Therefore, calculating the nullifier for a note requires a secret from its owner.

An application in Aztec.nr can request a secret from the current user for computing the nullifier of a note via the `request_nullifier_secret_key` API:

#include_code nullifier /noir-projects/aztec-nr/value-note/src/value_note.nr rust

Typically, `Npk_m` is stored in a note and later on, the note is nullified using the secret app-siloed version (denoted `nsk_app`).
`nsk_app` is derived by hashing `nsk_m` with the app contract address and it is necessary to present it to compute the nullifier.
Validity of `nsk_app` is verified by our protocol kernel circuits.

## Incoming viewing keys

The public key (denoted `Ivpk`) is used to encrypt a note for a recipient and the corresponding secret key (`ivsk`) is used by the recipient during decryption.

## Outgoing viewing keys

App-siloed versions of outgoing viewing keys are denoted `ovsk_app` and `Ovpk_app`.
These keys are used to encrypt a note for a note sender which is necessary for reconstructing transaction history from on-chain data.
For example, during a token transfer, the token contract may dictate that the sender encrypts the note with value with the recipient's `Ivpk`, but also records the transfer with its own `Ovpk_app` for bookkeeping purposes.
If these keys were not used and a new device would be synched there would be no "direct" information available about notes that a user created for other people.

## Tagging keys

Used to compute tags in a tagging note discovery scheme.

:::note
Tagging note discovery scheme won't be present in our testnet so we are intentionally not providing you with much info yet.
:::

## Signing keys

As mentioned above signing keys are not defined in protocol because of [account abstraction](../accounts/index.md#what-is-account-abstraction) and instead the key scheme is defined by the account contract.

Usually, an account contract will validate a signature of the incoming payload against a known signing public key.

This is a snippet of our Schnorr Account contract implementation, which uses Schnorr signatures for authentication:

#include_code is_valid_impl /noir-projects/noir-contracts/contracts/schnorr_account_contract/src/main.nr rust

Still, different accounts may use different signing schemes, may require multi-factor authentication, or _may not even use signing keys_ and instead rely on other authentication mechanisms. Read [how to write an account contract](../../../tutorials/codealong/contract_tutorials/write_accounts_contract.md) for a full example of how to manage authentication.

Furthermore, and since signatures are fully abstracted, how the key is stored in the contract is abstracted as well and left to the developer of the account contract.
In the following section we describe a few ways how an account contract could be architected to store signing keys.

### Storing signing keys

#### Using a private note

Storing the signing public key in a private note makes it accessible from the entrypoint function, which is required to be a private function, and allows for rotating the key when needed. However, keep in mind that reading a private note requires nullifying it to ensure it is up-to-date, so each transaction you send will destroy and recreate the public key. This has the side effect of enforcing a strict ordering across all transactions, since each transaction will refer the instantiation of the private note from the previous one.

#### Using an immutable private note

Similar to using a private note, but using an immutable private note removes the need to nullify the note on every read. This generates less nullifiers and commitments per transaction, and does not enforce an order across transactions. However, it does not allow the user to rotate their key should they lose it.

#### Using shared state

A compromise between the two solutions above is to use shared state. This would not generate additional nullifiers and commitments for each transaction while allowing the user to rotate their key. However, this causes every transaction to now have a time-to-live determined by the frequency of the mutable shared state, as well as imposing restrictions on how fast keys can be rotated due to minimum delays.

#### Reusing some of the in-protocol keys

It is possible to use some of the key pairs defined in protocol (e.g. incoming viewing keys) as the signing key.
Since this key is part of the address preimage (more on this on the privacy master key section), it can be validated against the account contract address rather than having to store it.
However, this approach is not recommended since it reduces the security of the user's account.

#### Using a separate keystore

Since there are no restrictions on the actions that an account contract may execute for authenticating a transaction (as long as these are all private function executions), the signing public keys can be stored in a [separate keystore contract](https://vitalik.ca/general/2023/06/09/three_transitions.html) that is checked on every call. This will incur in a higher proving time for each transaction, but has no additional cost in terms of fees, and allows for easier key management in a centralized contract.

### Complete address

When deploying a contract, the contract address is deterministically derived using the following scheme:

<!-- TODO: link contract deployment here once the updated section exists -->

```
partial_address := poseidon2("az_contract_partial_address_v1", contract_class_id, salted_initialization_hash)
public_keys_hash := poseidon2("az_public_keys_hash", Npk_m, Ivpk_m, Ovpk_m, Tpk_m)
address := poseidon2("az_contract_address_v1", public_keys_hash, partial_address)
```

Typically, for account contracts the public keys will be non-zero and for non-account contracts zero.
An example of a non-account contract which would have some of the keys non-zero is an escrow contract.
Escrow contract is a type of contract which on its own is an "owner" of a note meaning that it has a `Npk_m` registered and the notes contain this `Npk_m`.
Participants in this escrow contract would then somehow get a hold of the escrow's `nsk_m` and nullify the notes based on the logic of the escrow.
An example of an escrow contract is a betting contract. In this scenario, both parties involved in the bet would be aware of the escrow's `nsk_m`.
The escrow would then release the reward only to the party that provides a "proof of winning".

Because of the contract address derivation scheme it is possible to check that a given set of public keys corresponds to a given address just by trying to recompute it.
Since this is commonly needed to be done when sending a note to an account we coined the term **complete address** for the collection of:

1. all the user's public keys,
2. partial address,
3. contract address.

Once the complete address is shared with the sender, the sender can check that the address was correctly derived from the public keys and partial address and then send the notes to that address.
Because of this it is possible to send a note to an account whose account contract was not yet deployed.
