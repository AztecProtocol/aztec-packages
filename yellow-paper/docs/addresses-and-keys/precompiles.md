---
title: Precompiles
sidebar_position: 2
---

Precompiled contracts, which borrow their name from Ethereum's, are contracts not deployed by users but defined at the protocol level. These contracts are assigned well-known low-number addresses, and their implementation is subject to change via protocol upgrades. Precompiled contracts in Aztec are implemented as a set of circuits, one for each function they expose, like user-defined private contracts. Precompiles may make use of the local PXE oracle. Note that, unlike user-defined contracts, the address of a precompiled contract has no known preimage.

Rationale for precompiled contracts is to provide a set of vetted primitives for note encryption and tagging that applications can use safely. These primitives are guaranteed to be always satisfiable when called with valid arguments. This allows account contracts to choose their preferred method of encryption and tagging from any primitive in this set, and application contracts to call into them without the risk of calling into a untrusted code, which could potentially halt the execution flow via an unsatisfiable constrain. Furthermore, by exposing these primitives in a reserved set of well-known addresses, applications can be forward-compatible and incorporate new encryption and tagging methods as accounts opt into them.

## Constants

- `ENCRYPTION_BATCH_SIZES=[4, 16, 32]`: Defines what max batch sizes are supported in precompiled encryption methods.
- `ENCRYPTION_PRECOMPILE_ADDRESS_RANGE=0x00..0xFF`: Defines the range of addresses reserved for precompiles used for encryption and tagging.
- `MAX_PLAINTEXT_LENGTH`: Defines the maximum length of a plaintext to encrypt.
- `MAX_CYPHERTEXT_LENGTH`: Defines the maximum length of a returned encrypted cyphertext.
- `MAX_TAGGED_CYPHERTEXT_LENGTH`: Defines the maximum length of a returned encrypted cyphertext prefixed with a note tag.

## Encryption and tagging precompiles

All precompiles in the address range `ENCRYPTION_PRECOMPILE_ADDRESS_RANGE` are reserved for encryption and tagging. Application contracts can expected to call into these contracts with note plaintext, recipients, and public keys. To facilitate forward compatibility, all unassigned addresses within the range expose the functions below as no-ops, meaning that no actions will be executed when calling into them.

All functions in these precompiles accept a `PublicKeys` struct which contains the user advertised public keys. The structure of each of the public keys included can change from one encryption method to another, with the exception of the `nullifier_key` which is always restricted to a single field element. For forward compatibility, the precompiles interface accepts a hash of the public keys, which can be expanded within each method via an oracle call.

```
struct PublicKeys:
  nullifier_key: Field
  incoming_encryption_key: PublicKey
  outgoing_encryption_key: PublicKey
  incoming_internal_encryption_key: PublicKey
  tagging_key: PublicKey
```

To identify which public key to use in the encryption, precompiles also accept an enum:

```
enum EncryptionType:
  incoming = 1
  outgoing = 2
  incoming_internal = 3
```

Precompiles expose the following private functions:

```
validate_keys(public_keys_hash: Field): bool
```

Returns true if the set of public keys represented by `public_keys` is valid for this encryption and tagging mechanism. The precompile must guarantee that any of its methods must succeed if called with a set of public keys deemed as valid. This method returns `false` for undefined precompiles.

```
encrypt(public_keys_hash: Field, encryption_type: EncryptionType, recipient: AztecAddress, plaintext: Field[MAX_PLAINTEXT_LENGTH]): Field[MAX_CYPHERTEXT_LENGTH]
```

Encrypts the given plaintext using the provided public keys, and returns the encrypted cyphertext.

```
encrypt_and_tag(public_keys_hash: Field, encryption_type: EncryptionType, recipient: AztecAddress, plaintext: Field[MAX_PLAINTEXT_LENGTH]): Field[MAX_TAGGED_CYPHERTEXT_LENGTH]
```

Encrypts and tags the given plaintext using the provided public keys, and returns the encrypted note prefixed with its tag for note discovery.

```
encrypt_and_broadcast(public_keys_hash: Field, encryption_type: EncryptionType, recipient: AztecAddress, plaintext: Field[MAX_PLAINTEXT_LENGTH]): Field[MAX_TAGGED_CYPHERTEXT_LENGTH]
```

Encrypts and tags the given plaintext using the provided public keys, broadcasts them as an event, and returns the encrypted note prefixed with its tag for note discovery.

<!-- TODO: If the precompile is emitting the event here, how do we silo it to the emitting contract? How do we prevent one contract from emitting an event as if it were another? Should precompiles be allowed to emit events on behalf of msg_sender? Or should these precompiles be invoked with a (urgh) delegatecall so that events emitted by them look like emitted by msg_sender? Does this mean that precompiles should be class_ids? -->

```
encrypt<N>({ public_keys_hash: Field, encryption_type: EncryptionType, recipient: AztecAddress, plaintext: Field[MAX_PLAINTEXT_LENGTH] }[N]): Field[MAX_CYPHERTEXT_LENGTH][N]
encrypt_and_tag<N>({ public_keys_hash: Field, encryption_type: EncryptionType, recipient: AztecAddress, plaintext: Field[MAX_PLAINTEXT_LENGTH] }[N]): Field[MAX_TAGGED_CYPHERTEXT_LENGTH][N]
encrypt_and_broadcast<N>({ public_keys_hash: Field, encryption_type: EncryptionType, recipient: AztecAddress, plaintext: Field[MAX_PLAINTEXT_LENGTH] }[N]): Field[MAX_TAGGED_CYPHERTEXT_LENGTH][N]
```

Batched versions of the methods above, which accept an array of `N` tuples of public keys, recipient, and plaintext to encrypt in batch. Precompiles expose instances of this method for multiple values of `N` as defined by `ENCRYPTION_BATCH_SIZES`. Values in the batch with zeroes are skipped. These functions are intended to be used in [batched calls](../calls/batched-calls.md).

```
decrypt(public_keys_hash: Field, encryption_type: EncryptionType, owner: AztecAddress, cyphertext: Field[MAX_CYPHERTEXT_LENGTH]): Field[MAX_PLAINTEXT_LENGTH]
```

Decrypts the given cyphertext, encrypted for the provided owner. Instead of receiving the decryption key, this method triggers an oracle call to fetch the private decryption key directly from the local PXE and validates it against the supplied public key, in order to avoid leaking a user secret to untrusted application code. This method is intended for provable decryption use cases.

## Encryption strategies

List of encryption strategies implemented by precompiles:

### AES128

TODO

## Note tagging strategies

List of note tagging strategies implemented by precompiles:

### Incremental counter

TODO

## Defined precompiles

List of precompiles defined by the protocol and their assigned address.

| Address | Encryption | Note Tagging | Comments |
|---------|------------|--------------|----------|
| 0x01 | Noop | Noop | Used by accounts to explicitly signal that they cannot receive encrypted payloads. Validation method returns `true` only for an empty list of public keys. All other methods return empty. |
| 0x02 | AES128 | Incremental counter |  |
