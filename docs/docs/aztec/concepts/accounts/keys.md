---
title: Keys
tags: [accounts, keys]
---

import Image from "@theme/IdealImage";

In this section, you will learn what keys are used in Aztec, and how the addresses are derived.

## Types of keys

Each Aztec account is backed by four key pairs:

- Nullifier keys – used to spend notes.
- Address keys – this is an auxiliary key used for the address derivation; it’s internally utilized by the protocol and does not require any action from developers.
- Incoming viewing keys – used to encrypt a note for the recipient.
- Signing keys – an optional key pair used for account authorization.

The first three pairs are embedded into the protocol while the signing key is abstracted up to the account contract developer.

### Nullifier keys

Nullifier keys are presented as a pair of the master nullifier public key (`Npk_m`) and the master nullifier secret key (`nsk_m`).

To spend a note, the user computes a nullifier corresponding to this note. A nullifier is a hash of the note hash and app-siloed nullifier secret key, the latter is derived using the nullifier master secret key. To compute the nullifier, the protocol checks that the app-siloed key is derived from the master key for this contract and that master nullifier public key is linked to the note owner's address.

### Address keys

Address keys are used for account [address derivation](../accounts/index.md).

<Image img={require("@site/static/img/address_derivation.png")} />

Address keys are a pair of keys `AddressPublicKey` and `address_sk` where `address_sk` is a scalar defined as `address_sk = pre_address + ivsk` and `AddressPublicKey` is an elliptic curve point defined as `AddressPublicKey = address_sk * G`. This is useful for encrypting notes for the recipient with only their address.

`pre_address` can be thought of as a hash of all account’s key pairs and functions in the account contract.

In particular,

```
pre_address := poseidon2(public_keys_hash, partial_address)
public_keys_hash := poseidon2(Npk_m, Ivpk_m, Ovpk_m, Tpk_m)
partial_address := poseidon2(contract_class_id, salted_initialization_hash)
contract_class_id := poseidon2(artifact_hash, fn_tree_root, public bytecode commitment)
salted_initialization_hash := poseidon2(deployer_address, salt, constructor_hash)
```

where

- `artifact_hash` – hashes data from the Contract Artifact file that contains the data needed to interact with a specific contract, including its name, functions that can be executed, and the interface and code of those functions.
- `fn_tree_root` – hashes pairs of verification keys and function selector (`fn_selector`) of each private function in the contract.
- `fn_selector` – the first four bytes of the hashed `function signature` where the last one is a string consisting of the function's name followed by the data types of its parameters.
- `public bytecode commitment` – takes contract's code as an input and returns short commitment.
- `deployer_address` – account address of the contract deploying the contract.
- `salt` – a user-specified 32-byte value that adds uniqueness to the deployment.
- `constructor_hash` – hashes `constructor_fn_selector` and `constructor_args` where the last one means public inputs of the contract.

:::note
Under the current design Aztec protocol does not use `Ovpk` (outgoing viewing key) and `Tpk` (tagging key). However, formally they still exist and can be used by developers for some non-trivial design choices if needed.
:::

### Incoming viewing keys

The incoming viewing public key (`Ivpk`) is used by the sender to encrypt a note for the recipient. The corresponding incoming viewing secret key (`ivsk`) is used by the recipient to decrypt the note.

When it comes to notes encryption and decryption:

- For each note, there is a randomly generated ephemeral key pair (`esk`, `Epk`) where `Epk = esk * G`.
- The `AddressPublicKey` (derived from the `ivsk`) together with `esk` are encrypted as a secret `S`, `S = esk * AddressPublicKey`.
- `symmetric_encryption_key = hash(S)`
- `Ciphertext = aes_encrypt(note, symmetric_encryption_key)`
- The recipient gets a pair (`Epk`, `Ciphertext`)
- The recipient uses the `address_sk` to decrypt the secret: `S = Epk * address_sk`.
- The recipient uses the decrypted secret to decrypt the ciphertext.

### Signing keys

Thanks to the native [account abstraction](../accounts/index.md), authorization logic can be implemented in an alternative way that is up to the developer (e.g. using Google authorization credentials, vanilla password logic or Face ID mechanism). In these cases, signing keys may not be relevant.

However if one wants to implement authorization logic containing signatures (e.g. ECDSA or Shnorr) they will need signing keys. Usually, an account contract will validate a signature of the incoming payload against a known signing public key.

This is a snippet of our Schnorr Account contract implementation, which uses Schnorr signatures for authentication:

#include_code is_valid_impl noir-projects/noir-contracts/contracts/account/schnorr_account_contract/src/main.nr rust

### Storing signing keys

Since signatures are fully abstracted, how the public key is stored in the contract is abstracted as well and left to the developer of the account contract. Among a few common approaches are storing the key in a private note, in an immutable private note, using shared mutable state, reusing other in-protocol keys, or a separate keystore. Below, we elaborate on these approaches.

#### Using a private note​

Storing the signing public key in a private note makes it accessible from the `entrypoint` function, which is required to be a private function, and allows for rotating the key when needed. However, keep in mind that reading a private note requires nullifying it to ensure it is up-to-date, so each transaction you send will destroy and recreate the public key so the protocol circuits can be sure that the notes are not stale. This incurs cost for every transaction.

#### Using an immutable private note​

Using an immutable private note removes the need to nullify the note on every read. This generates no nullifiers or new commitments per transaction. However, it does not allow the user to rotate their key.

#include_code public_key noir-projects/noir-contracts/contracts/account/schnorr_account_contract/src/main.nr rust

:::note
When it comes to storing the signing key in a private note, there are several details that rely on the wallets:

- A note with a key is managed similar to any other private note. Wallets are expected to backup all the notes so that they can be restored on another device (e.g. if the user wants to move to another device).
- The note with the key might exist locally only (in PXE) or it can be broadcasted as an encrypted note by the wallet to itself. In the second case, this note will also exist on Aztec.
  :::

#### Using Shared Mutable state

By [Shared Mutable](../../../developers/reference/smart_contract_reference/storage/shared_state.md#sharedmutable) we mean privately readable publicly mutable state.

To make public state accessible privately, there is a delay window in public state updates. One needs this window to be able to generate proofs client-side. This approach would not generate additional nullifiers and commitments for each transaction while allowing the user to rotate their key. However, this causes every transaction to now have a time-to-live determined by the frequency of the mutable shared state, as well as imposing restrictions on how fast keys can be rotated due to minimum delays.

#### Reusing some of the in-protocol keys

It is possible to use some of the key pairs defined in protocol (e.g. incoming viewing keys) as the signing key. Since this key is part of the address preimage, it can be validated against the account contract address rather than having to store it. However, this approach is not recommended since it reduces the security of the user's account.

#### Using a separate keystore

Since there are no restrictions on the actions that an account contract may execute for authenticating a transaction (as long as these are all private function executions), the signing public keys can be stored in a separate keystore contract that is checked on every call. In this case, each user could keep a single contract that acts as a keystore, and have multiple account contracts that check against that keystore for authorization. This will incur a higher proving time for each transaction, but has no additional cost in terms of fees.

### Keys generation

All key pairs (except for the signing keys) are generated in the [Private Execution Environment](../pxe/index.md) (PXE) when a user creates an account. PXE is also responsible for the further key management (oracle access to keys, app siloed keys derivation, etc.)

### Keys derivation

All key pairs are derived using elliptic curve public-key cryptography on the [Grumpkin curve](https://github.com/AztecProtocol/aztec-connect/blob/9374aae687ec5ea01adeb651e7b9ab0d69a1b33b/markdown/specs/aztec-connect/src/primitives.md), where the secret key is represented as a scalar and the public key is represented as an elliptic curve point multiplied by that scalar.

The address private key is an exception and derived in a way described above in the [Address keys](#address-keys) section.

### The special case of escrow contracts

Typically, for account contracts the public keys will be non-zero and for non-account contracts zero.

An exception (a non-account contract which would have some of the keys non-zero) is an escrow contract. Escrow contract is a type of contract which on its own is an "owner" of a note meaning that it has a `Npk_m` registered and the notes contain this `Npk_m`.

Participants in this escrow contract would then somehow get a hold of the escrow's `nsk_m` and nullify the notes based on the logic of the escrow. An example of an escrow contract is a betting contract. In this scenario, both parties involved in the bet would be aware of the escrow's `nsk_m`. The escrow would then release the reward only to the party that provides a "proof of winning".

### App-siloed keys

Nullifier keys and Incoming view keys are app-siloed meaning they are scoped to the contract that requests them. This means that the keys used for the same user in two different application contracts will be different.

App-siloed keys allow to minimize damage of potential key leaks as a leak of the scoped keys would only affect one application.

App-siloed keys are derived from the corresponding master keys and the contract address. For example, for the app-siloed nullifier secret key: `nsk_app = hash(nsk_m, app_contract_address)`.

App-siloed keys [are derived](../advanced/storage/storage_slots.md#implementation) in PXE every time the user interacts with the application.

App-siloed incoming viewing key also allows per-application auditability. A user may choose to disclose this key for a given application to an auditor or regulator (or for 3rd party interfaces, e.g. giving access to a block explorer to display my activity), as a means to reveal all their activity within that context, while retaining privacy across all other applications in the network.

### Key rotation

Key rotation is the process of creating new signing keys to replace existing keys. By rotating encryption keys on a regular schedule or after specific events, you can reduce the potential consequences of the key being compromised.

On Aztec, key rotation is impossible for nullifier keys, incoming viewing keys and address keys as all of them are embedded into the address and address is unchangeable. In the meanwhile, signing keys can be rotated.
