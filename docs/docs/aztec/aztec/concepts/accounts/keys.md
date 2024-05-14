# Keys
The goal of this section is to give app developer a good idea what keys there are used in the system.
For a detailed description head over to [protocol specification](../../../protocol-specs/addresses-and-keys/keys#cheat-sheet).

Each account in Aztec is backed by 4 key pairs keys:

- A **nullifier key pair*** used for note nullifier computation.
- A **incoming viewing key pair*** used to encrypt a note for note recipient.
- A **outgoing viewing key pair*** used to encrypt a note for note sender.
- A **tagging key pair*** used to compute tags in a [tagging note discovery scheme](../../../protocol-specs/private-message-delivery/private-msg-delivery#note-tagging).

:::info
All these keys are derived from a secret using a ZCash inspired scheme defined in [protocol specification](../../../protocol-specs/addresses-and-keys/keys#cheat-sheet).
:::

:::note
Additionally, there is typically a signing key pair which is used for for authenticating the owner of the account.
However, since Aztec supports native [account abstraction](../accounts/main#what-is-account-abstraction) this is not defined in protocol.
Instead it's up to the account contract developer to implement it.
:::

## Public key retrieval
The keys can either be received from a key registry contract or from PXE.

### Retrieval from key registry
...

## Scoped keys
Even though all the keys above are derived from the same secret, all the keys above are scoped (also called app-siloed) to the contract that requests them.
This means that the keys used for the same user in two different application contracts will be different.

This allows per-application auditability.
A user may choose to disclose their incoming and outgoing viewing keys for a given application to an auditor or regulator (or for 3rd party interfaces, e.g. giving access to a block explorer to display my activity), as a means to reveal all their activity within that context, while retaining privacy across all other applications in the network.

In the case of nullifier keys, there is also a security reason involved.
Since the nullifier secret is exposed in plain text to the application contract, the contract may accidentally or maliciously leak it.
If that happens, only the nullifier secret for that application is compromised.

## Protocol key types
All the keys bellow are Grumpkin keys (public keys derived on a Grumpkin curve).

## Nullifier keys
These keys are called a master nullifier secret key (`nsk_m`) and master nullifier public key(`Npk_m`).
Typically, `Npk_m` is stored in a note and later on the note is nullified using app-siloed nullifier secret key (denoted `nsk_app`).
`nsk_app` is derived by hashing `nsk_m` with the app contract address and it is necessary to present it to compute the nullifier.
Validity of `nsk_app` is automatically verified by our [protocol kernel circuits](../../../protocol-specs/circuits/private-kernel-tail#verifying-and-splitting-ordered-data).

It was necessary to use `nsk_app` instead of `nsk_m` to prevent a malicious app from leaking user's `nsk_m` (which would affect other apps as well).
With our design `nsk_m` never touches app code.

## Incoming viewing keys
Called master incoming viewing secret key (`ivsk_m`) and master incoming viewing public key (`Ivpk_m`).
The app-siloed version of public key (denoted `Ivpk_app`) is used to encrypt a note for a recipient and the the corresponding secret key (`ivsk_app`) is used by recipient during decryption.

## Outgoing viewing keys
Called master outgoing viewing secret key (`ovsk_m`, app-siloed denoted `ovsk_app`) and master outgoing viewing public key (`Ovpk_m`, app-siloed denoted `Ovpk_app`).
These keys are used to encrypt a note for a note sender which is necessary for reconstructing transaction history from on-chain data.
For example, during a token transfer, the token contract may dictate that the sender encrypts the note with value with the recipient's `Ivpk_app`, but also records the transfer with its own `Ovpk_app` for bookkeeping purposes.
If these keys were not used and a new device would be synched there would be no "direct" information available about notes that a user created for other people.

## Tagging keys
Called master tagging secret key (`tsk_m`) and master tagging public key (`Tpk_m`).
Used to compute tags in a [tagging note discovery scheme](../../../protocol-specs/private-message-delivery/private-msg-delivery#note-tagging).

:::note
Tagging note discovery scheme won't be present in our testnet so we are intentionally not providing you with much info here at this point.
:::

## Signing keys

As mentioned above signing keys are not defined in protocol because of [account abstraction](../accounts/main#what-is-account-abstraction) and instead the key scheme is defined by the account contract.

Usually, an account contract will validate a signature of the incoming payload against a known signing public key.

This is a snippet of our Schnorr Account contract implementation, which uses Schnorr signatures for authentication:

#include_code entrypoint /noir-projects/noir-contracts/contracts/schnorr_account_contract/src/main.nr rust

Still, different accounts may use different signing schemes, may require multi-factor authentication, or _may not even use signing keys_ and instead rely on other authentication mechanisms. Read [how to write an account contract](/tutorials/tutorials/write_accounts_contract.md) for a full example of how to manage authentication.

Furthermore, and since signatures are fully abstracted, how the key is stored in the contract is abstracted as well and left to the developer of the account contract. Here are a few ideas on how to store them, each with their pros and cons.

### Ways to store signing keys
Below we described a few ways how an account contract could be architected to obtain signing keys.

#### Using a private note

Storing the signing public key in a private note makes it accessible from the entrypoint function, which is required to be a private function, and allows for rotating the key when needed. However, keep in mind that reading a private note requires nullifying it to ensure it is up to date, so each transaction you send will destroy and recreate the public key. This has the side effect of enforcing a strict ordering across all transactions, since each transaction will refer the instantiation of the private note from the previous one.

#### Using an immutable private note

Similar to using a private note, but using an immutable private note removes the need to nullify the note on every read. This generates less nullifiers and commitments per transaction, and does not enforce an order across transactions. However, it does not allow the user to rotate their key should they lose it.

#### Using shared state

A compromise between the two solutions above is to use [shared state](/reference/reference/smart_contract_reference/storage/shared_state.md). This would not generate additional nullifiers and commitments for each transaction while allowing the user to rotate their key. However, this causes every transaction to now have a time-to-live determined by the frequency of the mutable shared state, as well as imposing restrictions on how fast keys can be rotated due to minimum delays.

#### Reusing some of the in-protocol keys

It is possible to use some of the key pairs defined in protocol (e.g. incoming viewing keys) as the signing key.
Since this key is part of the address preimage (more on this on the privacy master key section), you it can be validated against the account contract address rather than having to store it.
However, this approach is not recommended since it reduces the security of the user's account.

#### Using a separate keystore

Since there are no restrictions on the actions that an account contract may execute for authenticating a transaction (as long as these are all private function executions), the signing public keys can be stored in a [separate keystore contract](https://vitalik.ca/general/2023/06/09/three_transitions.html) that is checked on every call. This will incur in a higher proving time for each transaction, but has no additional cost in terms of fees, and allows for easier key management in a centralized contract.




### Addresses, partial addresses, and public keys

When deploying a contract, the address is deterministically derived from the contract code, the constructor arguments, a salt, and a public key:

```
partial_address := hash(salt, contract_code, constructor_hash)
address := hash(public_key, partial_address)
```

This public key corresponds to the privacy master key of the account. In order to manage private state, such as receiving an encrypted note, an account needs to share its partial address and public key, along with its address. This allows anyone to verify that the public key corresponds to the intended address. We call the address, partial address, and public key of a user their **complete address**.

Contracts that are not meant to represent a user who handles private state, usually non-account contracts such as applications, do not need to provide a valid public key, and can instead just use zero to denote that they are not expected to receive private notes.

:::info
A side effect of enshrining and encoding privacy keys into the account address is that these keys cannot be rotated if they are leaked. Read more about this in the [account abstraction section](./index.md#encryption-and-nullifying-keys).
:::




### Encryption keys

An application in Aztec.nr can access the encryption public key for a given address using the oracle call `get_public_key`, which you can then use for calls such as `emit_encrypted_log`:

#include_code encrypted /noir-projects/aztec-nr/address-note/src/address_note.nr rust

:::info
In order to be able to provide the public encryption key for a given address, that public key needs to have been registered in advance. At the moment, there is no broadcasting mechanism for public keys, which means that you will need to manually register all addresses you intend to send encrypted notes to. You can do this via the `registerRecipient` method of the Private Execution Environment (PXE), callable either via aztec.js or the CLI.
Note that any accounts you own that have been added to the PXE are automatically registered.
:::

### Nullifier secrets

In addition to deriving encryption keys, the privacy master key is used for deriving nullifier secrets. Whenever a private note is consumed, a nullifier deterministically derived from it is emitted. This mechanisms prevents double-spends, since nullifiers are checked by the protocol to be unique. Now, in order to preserve privacy, a third party should not be able to link a note commitment to its nullifier - this link is enforced by the note implementation. Therefore, calculating the nullifier for a note requires a secret from its owner.

An application in Aztec.nr can request a secret from the current user for computing the nullifier of a note via the `request_nullifier_secret_key` api:

#include_code nullifier /noir-projects/aztec-nr/value-note/src/value_note.nr rust



### Security considerations

A leaked privacy master key means a loss of privacy for the affected user. An attacker who holds the privacy private key of a user can derive the encryption private keys to decrypt all past inbound and outbound private notes, and can derive the nullifier secrets to determine when these notes were consumed.

Nevertheless, the attacker cannot steal the affected user's funds, since authentication and access control depend on the signing keys and are managed by the user's account contract.

:::info
Note that, in the current architecture, the user's wallet needs direct access to the privacy private key, since the wallet needs to use this key for attempting decryption of all notes potentially sent to the user. This means that the privacy private key cannot be stored in a hardware wallet or hardware security module, since the wallet software uses the private key material directly. This may change in future versions in order to enhance security.
:::
