---
title: Precompiles
sidebar_position: 2
---

Precompiled contracts, which borrow their name from Ethereum's, are contracts not deployed by users but defined at the protocol level. These contracts are assigned well-known low-number addresses, and their implementation is subject to change via protocol upgrades. Precompiled contracts in Aztec are implemented as a set of circuits, one for each function they expose, like user-defined private contracts. Precompiles may make use of the local PXE oracle. Note that, unlike user-defined contracts, the address of a precompiled contract has no known preimage.

Rationale for precompiled contracts is to provide a set of vetted primitives for note encryption and tagging that applications can use safely. These primitives are guaranteed to be always satisfiable when called with valid arguments. This allows account contracts to choose their preferred method of encryption and tagging from any primitive in this set, and application contracts to call into them without the risk of calling into a untrusted code, which could potentially halt the execution flow via an unsatisfiable constrain. Furthermore, by exposing these primitives in a reserved set of well-known addresses, applications can be forward-compatible and incorporate new encryption and tagging methods as accounts opt into them.

## Constants

- `ENCRYPTION_BATCH_SIZES=[4, 16, 32]`: Defines what max batch sizes are supported in precompiled encryption methods.
- `ENCRYPTION_PRECOMPILE_ADDRESS_RANGE=0x00..0xFF`: Defines the range of addresses reserved for precompiles used for encryption and tagging.

## Encryption and tagging precompiles

All precompiles in the address range `ENCRYPTION_PRECOMPILE_ADDRESS_RANGE` are reserved for encryption and tagging. Application contracts can expected to call into these contracts with note plaintext, recipients, and public keys. To facilitate forward compatibility, all unassigned addresses within the range expose the functions below as no-ops, meaning that no actions will be executed when calling into them.

These precompiles expose the following private functions:

```
validate_keys(public_keys: Field[]): bool
```

<!-- TODO: What's the max length for public_keys? Do we differentiate the keys in this array, or let the encryption method to handle them? -->


Returns true if the set of public keys represented by `public_keys` is valid for this encryption and tagging mechanism. The precompile must guarantee that any of its methods must succeed if called with a set of public keys deemed as valid. This method returns `false` for undefined precompiles.

```
encrypt(public_keys: Field[], recipient: AztecAddress, plaintext: Field[]): Field[]
```

<!-- TODO: How do we identify which key to use here? (ie incoming or outgoing?) Who does the derivation if needed? What are the max lengths for plaintext and returned cyphertext? Should we have multiple flavors? -->

Encrypts the given plaintext using the provided public keys, and returns the encrypted cyphertext.

```
encrypt_and_tag(public_keys: Field[], recipient: AztecAddress, plaintext: Field[])
```

<!-- TODO: Does this method also broadcast? If so, should it broadcast as if it were msg_sender? If not, how do we handle scenarios when we need to broadcast more than one note if there are multiple recipients? -->

Encrypts and tags the given plaintext using the provided public keys.

```
encrypt<N>({ public_keys: Field[], recipient: AztecAddress, plaintext: Field[] }[N]): Field[][N]
```

Same as `encrypt`, but accepts an array of `N` tuples of public keys, recipient, and plaintext to encrypt in batch. Precompiles expose instances of this method for multiple values of `N` as defined by `ENCRYPTION_BATCH_SIZES`. Batch values defined as zero are skipped.

```
encrypt_and_tag<N>({ public_keys: Field[], recipient: AztecAddress, plaintext: Field[] }[N])
```

Same as `encrypt_and_tag`, but batched using the same logic as `encrypt<N>`.

```
decrypt(public_keys: Field[], owner: AztecAddress, cyphertext: Field[]): Field[]
```

Decrypts the given cyphertext, encrypted for the provided owner. Instead of receiving the decryption key, this method triggers an oracle call to fetch the private decryption key directly from the local PXE and validates it against the supplied public key, in order to avoid leaking a user secret to untrusted application code. This method is intended for provable decryption use cases.


## Defined precompiles

List of precompiles defined by the protocol and their assigned address.

<!-- TODO: Should we have a precompile for delegation? Or handle that at the registry/app level? Probably registry, since precompiles cannot go back to the registry to re-read? -->

### Noop

Address `0x01` is defined to always be a noop. Accounts that explicitly signal that they cannot receive encrypted payloads can advertise this precompile. Validation method returns `true` only for an empty list of public keys, and all other methods return empty.

### AES encryption with handshakes

Address `0x02` encrypts payloads using AES symmetric encryption, using an encryption key derived from the recipient's public key. Note discovery is performed by establishing a shared secret via an initial handshake for each sender-recipient pair, and broadcasting tags that result from hashing the shared secret and an incremental counter.

<!-- TODO: Complete spec. Specify the flavor of public keys. -->