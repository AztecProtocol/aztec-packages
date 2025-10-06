---
title: Account Contracts & Account Abstraction
description: Understand how Aztec's native account abstraction works, including transaction flow through account contracts, key management, authentication, and note discovery.
sidebar_position: 1
tags: [accounts, account abstraction, keys, authwit]
---

import Image from "@theme/IdealImage";

In this guide, we'll explore how account contracts work in Aztec, including how transactions enter the network, how validation happens, and the unique key management system that enables privacy-preserving authentication.

## Learning Objectives

By the end of this guide, you will understand:

1. How transactions start at the account contract and flow through the network
2. How account contract validation works
3. The sets of keys that make account contracts different from other contracts
4. Why private keys (in the Ethereum EOA sense) are not required on Aztec

## Account Contracts as the Network Entry Point

In Aztec, every account is a smart contract. Unlike Ethereum, which has Externally Owned Accounts (EOAs) controlled by private keys, Aztec uses native account abstraction where all accounts are implemented as contracts.

### The Account Contract Entrypoint

Account contracts serve as the **entry point** for all user-initiated transactions on the Aztec network. When you want to execute a transaction, it always begins at your account contract's `entrypoint` function.

The entrypoint function receives:

- **Actions to execute**: The private and public function calls you want to make
- **Authentication payload**: Proof that you're authorized to execute these actions

Here's the conceptual flow in pseudocode (from [/docs/developers/docs/concepts/accounts/index.md:48-68](../../developers/docs/concepts/accounts/index.md)):

```text
publicKey: PublicKey;

def entryPoint(payload):
    let { privateCalls, publicCalls, nonce, signature } = payload;
    let payloadHash = hash(privateCalls, publicCalls, nonce);
    validateSignature(this.publicKey, signature, payloadHash);

    foreach privateCall in privateCalls:
        let { to, data, value } = privateCall;
        call(to, data, value);

    foreach publicCall in publicCalls:
        let { to, data, value, gasLimit } = publicCall;
        enqueueCall(to, data, value, gasLimit);
```

### How Transactions Enter the Network

The complete transaction lifecycle follows this pattern:

1. **User initiates transaction**: You request an action through your wallet (e.g., "transfer 10 tokens")
2. **Wallet constructs payload**: Your wallet creates a transaction request containing:
   - The account contract address (origin)
   - The entrypoint function to call
   - The encoded private and public calls
   - Authentication data (e.g., signature)
3. **Private execution**: The Private eXecution Environment (PXE) on your device executes the account contract's entrypoint function, which:
   - **Validates authentication** (e.g., checks your signature)
   - **Executes private calls** to other contracts
   - **Enqueues public calls** for later execution
   - **Generates zero-knowledge proofs** of correct execution
4. **Network submission**: The PXE sends proofs and transaction data to the sequencer
5. **Public execution**: The sequencer executes any enqueued public functions
6. **Settlement**: The transaction is included in a block and settles to L1

### What Makes Account Contracts Special

The key distinction is that the account contract acts as a **trusted gatekeeper**. Before relaying any application calls to other contracts, the account contract:

1. **Authenticates the request**: Verifies that the transaction is authorized (via signature, multi-sig, passkey, etc.)
2. **Manages replay protection**: Ensures the transaction can't be executed multiple times
3. **Handles fee payment**: Determines how transaction fees will be paid
4. **Executes application logic**: Makes the actual calls to other contracts with your desired arguments

This pattern means that application contracts (like token contracts) don't need to implement their own authentication logic. They can trust that if a call comes from an account contract with a valid proof, that account has properly authenticated the user.

### Non-Standard Entrypoints

Since the entrypoint interface is not enshrined in the protocol, any contract can define functions that act as entrypoints. This enables use cases where no specific user authentication is needed.

For example, a lottery contract might have a `pay` function that anyone can call to distribute prizes. Anyone can submit a transaction that:

- Sets the lottery contract itself as the `origin`
- Calls `pay` as the entrypoint function
- Executes without requiring a specific user's authentication

For reference, see the [SignerLess wallet implementation](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec.js/src/wallet/signerless_wallet.ts) and the [e2e_crowdfunding_and_claim test](https://github.com/AztecProtocol/aztec-packages/blob/88b5878dd4b95d691b855cd84153ba884adf25f8/yarn-project/end-to-end/src/e2e_crowdfunding_and_claim.test.ts#L322).

Note about `msg_sender` (from [/docs/developers/docs/concepts/accounts/index.md:84-92](../../developers/docs/concepts/accounts/index.md)):

- When no contract entrypoint is used, `msg_sender` is set to `Field.max`
- In a private to public entrypoint, `msg_sender` is the contract making the call
- When calling the entrypoint on an account contract, `msg_sender` is the account contract address

## Account Contract Validation

Account validation is where Aztec's native account abstraction truly shines. The validation logic is entirely up to the account contract developer.

### Flexible Authentication

While Ethereum EOAs require ECDSA signatures over secp256k1, Aztec account contracts can implement **any authentication mechanism**, including:

- **Schnorr signatures** (more efficient in ZK circuits)
- **Multi-signatures** requiring multiple parties to approve
- **Passkey authentication** using WebAuthn
- **Biometric authentication** (e.g., Face ID, fingerprint)
- **Social recovery** mechanisms
- **Google/OAuth credentials**
- **Password-based authentication**

Here's an example from the Schnorr Account contract showing signature validation (from [/docs/developers/docs/concepts/accounts/keys.md:82-84](../../developers/docs/concepts/accounts/keys.md)):

```rust
#include_code is_valid_impl noir-projects/noir-contracts/contracts/account/schnorr_account_contract/src/main.nr rust
```

### How Validation Works

When your account contract's entrypoint is called, it performs validation in private execution on your device:

1. **Receive payload**: Get the transaction details and authentication data
2. **Hash the payload**: Create a commitment to what you're authorizing
3. **Verify authentication**: Check the signature/credential against stored public key
4. **Execute if valid**: Proceed with the transaction if authentication succeeds
5. **Generate proof**: Create a ZK proof that validation succeeded (without revealing authentication details)

Because this validation happens in a zero-knowledge proof:

- **The authentication method is private**: Nobody knows whether you used a signature, password, or biometrics
- **The complexity doesn't matter**: Complex validation (like checking many signatures) is free from a gas perspective
- **No spam attacks**: Invalid transactions fail during proving and never reach the network

### Unlimited Complexity Without DoS Risk

Traditional blockchains limit authentication complexity to prevent denial-of-service attacks. If validation were expensive, an attacker could flood the mempool with invalid transactions that waste sequencer resources.

On Aztec, validation complexity is unlimited because:

- Validation happens **client-side** during proof generation
- The sequencer only verifies a **constant-size proof**, regardless of validation complexity
- Invalid transactions **fail during proving** and never reach the network
- You pay for validation in **client-side prover time**, not gas fees

This enables powerful use cases (from [/docs/developers/docs/concepts/accounts/index.md:36-40](../../developers/docs/concepts/accounts/index.md)):

- Multi-signature contracts with arbitrary numbers of signers
- Oracle contracts verifying arbitrary amounts of data
- Complex authentication logic that would be prohibitively expensive on Ethereum

## The Key System: Beyond Private Keys

One of the most significant differences between Aztec accounts and Ethereum EOAs is the key management system. While Ethereum accounts are controlled by a single private key, Aztec accounts use **four different key pairs**, each serving a specific purpose.

### Overview of Account Keys

Each Aztec account is backed by four key pairs (from [/docs/developers/docs/concepts/accounts/keys.md:11-20](../../developers/docs/concepts/accounts/keys.md)):

1. **Nullifier keys** (`Npk_m`, `nsk_m`) – Used to spend notes
2. **Address keys** (`AddressPublicKey`, `address_sk`) – Used for address derivation
3. **Incoming viewing keys** (`Ivpk`, `ivsk`) – Used to encrypt notes for recipients
4. **Signing keys** (optional) – Used for account authorization

The first three pairs are embedded into the protocol, while signing keys are abstracted to the account contract developer.

### 1. Nullifier Keys: Spending Your Notes

**Purpose**: Prove ownership of notes and spend them by computing nullifiers.

To spend a note in Aztec, you must compute a nullifier - a unique value that prevents the note from being spent twice. The nullifier is derived using your nullifier secret key.

**How it works**:

- Each note is "owned" by a master nullifier public key (`Npk_m`)
- To spend a note, compute: `nullifier = hash(note_hash, app_siloed_nsk)`
- The app-siloed key is derived as: `nsk_app = hash(nsk_m, contract_address)`
- The protocol verifies that the app-siloed key is correctly derived from the master key
- The protocol verifies that the master nullifier public key matches the note owner's address

**App-siloing for security**: Nullifier keys are scoped per contract. This means:

- A key leak for one application doesn't compromise your other applications
- Each contract you interact with uses a different derived nullifier key
- The derivation is deterministic: `nsk_app = hash(nsk_m, contract_address)`

### 2. Address Keys: Your Account Identity

**Purpose**: Derive your account address and enable encrypted note reception.

Your Aztec address is derived from a complex formula that commits to:

- All your public keys (`Npk_m`, `Ivpk_m`, `Ovpk_m`, `Tpk_m`)
- Your account contract code (bytecode, functions, etc.)
- Deployment parameters (deployer, salt, constructor arguments)

From [/docs/developers/docs/concepts/accounts/keys.md:29-56](../../developers/docs/concepts/accounts/keys.md):

<Image img={require("@site/static/img/address_derivation.png")} />

```
address_sk = pre_address + ivsk
AddressPublicKey = address_sk * G

pre_address := poseidon2(public_keys_hash, partial_address)
public_keys_hash := poseidon2(Npk_m, Ivpk_m, Ovpk_m, Tpk_m)
partial_address := poseidon2(contract_class_id, salted_initialization_hash)
```

**Key insight**: Your address is the x-coordinate of the `AddressPublicKey` on the Grumpkin elliptic curve. This makes addresses deterministic and verifiable.

**Why this matters**:

- Anyone can verify that your public keys correspond to your address
- You can receive funds **before deploying** your account contract
- Your address commits to your account contract code, preventing substitution attacks

### 3. Incoming Viewing Keys: Receiving Private Notes

**Purpose**: Enable others to encrypt notes for you, and enable you to decrypt notes you receive.

When someone sends you a private note, they need to encrypt it so only you can read it. This is done using your incoming viewing public key (`Ivpk`).

**Encryption process** (from [/docs/developers/docs/concepts/accounts/keys.md:63-74](../../developers/docs/concepts/accounts/keys.md)):

1. Sender generates an ephemeral key pair: `(esk, Epk)` where `Epk = esk * G`
2. Sender computes shared secret: `S = esk * AddressPublicKey`
3. Sender derives symmetric key: `symmetric_key = hash(S)`
4. Sender encrypts note: `ciphertext = aes_encrypt(note, symmetric_key)`
5. Sender emits `(Epk, ciphertext)` onchain

**Decryption process**:

1. You retrieve `(Epk, ciphertext)` from onchain data
2. You compute shared secret: `S = Epk * address_sk`
3. You derive symmetric key: `symmetric_key = hash(S)`
4. You decrypt: `note = aes_decrypt(ciphertext, symmetric_key)`

**App-siloing for auditability**: Like nullifier keys, incoming viewing keys are app-siloed:

- You can share your `ivsk_app` for a specific contract with an auditor or regulator
- They can see all your activity in that application
- Your activity in other applications remains private

### 4. Signing Keys: Optional Authorization

**Purpose**: Provide authentication via cryptographic signatures (if your account contract uses them).

Thanks to native account abstraction, signing keys are **entirely optional**. Your account contract might:

- Use Schnorr or ECDSA signatures
- Use no signatures at all (e.g., passkey or biometric authentication)
- Store the signing public key in various ways

**Storage options** (from [/docs/developers/docs/concepts/accounts/keys.md:86-119](../../developers/docs/concepts/accounts/keys.md)):

1. **Private note**: Key is stored in a note, nullified and recreated on every read (costly but allows rotation)
2. **Immutable private note**: Key is stored in a note that's never nullified (efficient but no rotation)
3. **Delayed public mutable state**: Privately readable but publicly mutable (allows rotation with time delays)
4. **Reuse in-protocol keys**: Use one of the embedded keys as signing key (not recommended, reduces security)
5. **Separate keystore contract**: Store keys in a dedicated contract checked during authentication

### Why Private Keys (EOA-style) Are Not Required

On Ethereum, every account **must** have a private key because:

- The authentication mechanism (ECDSA signatures) is enshrined in the protocol
- Only transactions signed with the correct private key are considered valid
- There's no flexibility to use alternative authentication methods

On Aztec, private keys (in the EOA sense) are not required because:

1. **Native account abstraction**: Authentication logic is implemented in contracts, not in the protocol
2. **Flexible authentication**: You can use signatures, passwords, biometrics, multi-sig, or any combination
3. **Protocol-level keys serve different purposes**: The keys embedded in the protocol (nullifier, address, incoming viewing) are for privacy operations, not authentication
4. **Authorization is programmable**: Your account contract decides what "authorized" means

For example, an account contract could:

- Require a password hash and a smartphone secure enclave attestation
- Require 3-of-5 signatures from a set of guardians
- Require a WebAuthn credential verified through a browser
- Require proof of ownership of a physical passport
- Any combination of the above

The signing key (if used) is just one possible authentication method among many.

### Key Generation and Management

**Generation**: All key pairs (except signing keys) are automatically generated in the Private eXecution Environment (PXE) when you create an account. The PXE manages these keys throughout their lifecycle.

**Derivation**: All keys use elliptic curve cryptography on the Grumpkin curve:

- Secret key = scalar value
- Public key = scalar \* G (generator point)

**Rotation**:

- **Nullifier, address, and incoming viewing keys cannot be rotated** because they're embedded in your address
- **Signing keys can be rotated** (if your account contract supports it) depending on storage mechanism

## Authorizing Actions with AuthWit

Beyond the initial transaction authentication, Aztec accounts support a powerful pattern for authorizing **specific actions** to be performed on your behalf. This is called Authentication Witness (AuthWit).

### The Problem AuthWit Solves

In DeFi and other applications, contracts often need to execute actions on behalf of users. For example:

- A DEX needs to transfer tokens from your account to complete a swap
- A lending protocol needs to transfer collateral from your account

On Ethereum, this is solved with the `approve` mechanism:

1. User calls `token.approve(spender, amount)` to grant an allowance
2. Spender calls `token.transferFrom(user, recipient, amount)` to use the allowance

**Problems with this approach**:

- Requires **two transactions** (approve + action)
- **Infinite approvals** are risky (spender can steal funds if compromised)
- **Opaque to users** (what am I actually approving?)
- **Doesn't work well with smart contract wallets**

### How AuthWit Works

AuthWit allows you to authorize a **specific action** rather than an open-ended allowance. The authorization is represented as a hash of (from [/docs/developers/docs/concepts/advanced/authwit.md:71-79](../../developers/docs/concepts/advanced/authwit.md)):

```rust
authentication_witness_action = H(
    caller: AztecAddress,
    contract: AztecAddress,
    selector: Field,
    argsHash: Field
);
```

This can be read as: "I authorize `caller` to execute `selector` on `contract` with arguments hashing to `argsHash`."

**Example**: Authorizing a DEX to transfer 1000 tokens:

```rust
action = H(defi_contract, token_contract, transfer_selector, H(alice, defi, 1000));
```

### Private AuthWit Flow

For private functions, the authwit is provided through the PXE as an oracle during transaction execution:

<Image img={require("@site/static/img/authwit3.png")} />

1. User creates authwit (e.g., signs the action hash)
2. User stores authwit in their PXE
3. DeFi contract calls `token.transfer_from(alice, defi, 1000)`
4. Token contract asks: "Is this transfer authorized?"
5. Token contract makes a **static call** to Alice's account contract: `is_valid(action_hash)`
6. Alice's account contract requests the authwit from the PXE (oracle call)
7. Alice's account contract verifies the authwit (e.g., checks signature)
8. If valid, token contract proceeds with transfer

**Key point**: This all happens during private execution on the user's device. The authwit never leaves the user's control.

### Public AuthWit Flow

For public functions, oracles aren't available (execution is on the sequencer, not user's device). Instead, authwits are stored in a **shared public registry**:

<Image img={require("@site/static/img/authwit4.png")} />

1. User's account contract calls `authwit_registry.set(action_hash, true)` (can be batched with the transaction)
2. DeFi contract calls `token.transfer_from(alice, defi, 1000)`
3. Token contract checks: `authwit_registry.get(action_hash)` returns `true`
4. Token contract proceeds with transfer
5. Token contract removes the authwit from the registry: `authwit_registry.set(action_hash, false)`

**Optimization**: If the authwit is both set and consumed in the same transaction, there's no permanent state change, saving gas.

### Replay Protection

To prevent an authwit from being used multiple times, the action hash itself is emitted as a **nullifier**. Once used, the same action cannot be authorized again.

If you need to authorize the same action multiple times, include a **nonce** in the arguments:

```rust
action = H(defi, token, transfer_selector, H(alice, defi, 1000, nonce));
```

### AuthWit vs Approve

**Key differences**:

- **Specific vs Open-ended**: AuthWit authorizes a specific action with specific arguments; `approve` grants an open allowance
- **One transaction**: AuthWit can be bundled with the action in a single transaction
- **User clarity**: Users see exactly what they're authorizing
- **Works with any authentication**: AuthWit works with any account contract authentication method

**Use cases**: AuthWit can authorize any action requiring authentication:

- Token transfers
- Token burns
- Converting assets from public to private
- Voting in governance
- Executing operations on lending/DeFi protocols

For implementation details, see [how to use authwit](../../developers/docs/guides/smart_contracts/how_to_use_authwit.md).

## Note Discovery

The final piece of the account puzzle is understanding how you find out about notes that belong to you. This process is called **note discovery**.

### The Challenge

When someone sends you a private note:

- The note is encrypted and stored onchain
- You need to find it among potentially millions of encrypted notes
- You can't brute-force decrypt every note (too expensive)
- You can't rely solely on offchain communication (not self-sufficient)

### Aztec's Solution: Note Tagging

Aztec uses a **note tagging** system where each encrypted note log includes a **tag** that you and the sender can both compute (from [/docs/developers/docs/concepts/advanced/storage/note_discovery.md:20-33](../../developers/docs/concepts/advanced/storage/note_discovery.md)):

**How it works**:

1. **Every log has a tag**: Each emitted log is `[tag, encrypted_data]` where `tag` is used for indexing
2. **Tag generation**: The tag is derived from a **shared secret** and an **index** (counter):
   ```
   tag = derive_tag(shared_secret, index)
   shared_secret = function_of(sender_keys, recipient_keys)
   ```
3. **Sender increments index**: Each time the sender creates a note for you, they increment the index
4. **Recipient searches**: You query the Aztec node: `getLogsByTags([tag_0, tag_1, tag_2, ...])`
5. **Contract implementation**: Note discovery is implemented by Aztec contracts (not the PXE), allowing customization

### Discovery Flow

When you want to find your notes:

1. For each known sender and each contract:
   - Compute `shared_secret` from sender's keys and your keys
   - Generate tags: `tag_0, tag_1, tag_2, ...` up to expected index
2. Query Aztec node: `getLogsByTags([tag_0, tag_1, tag_2, ...])`
3. For each matching log:
   - Extract `(Epk, ciphertext)` from the log
   - Decrypt using your `address_sk` (incoming viewing key process)
   - If decryption succeeds, store the note

### Limitations

From [/docs/developers/docs/concepts/advanced/storage/note_discovery.md:38-42](../../developers/docs/concepts/advanced/storage/note_discovery.md):

1. **Cannot receive from unknown senders**: You need to know the sender's address to generate the shared secret and tags
   - Workaround: Senders register in a contract, recipients search for all registered senders
2. **Index synchronization**: If transactions are reordered or reverted, you might miss notes
   - Solution: Widen the search window and implement restrictions on high-frequency sending

### Receiving Before Deployment

One powerful feature of note discovery is that **you can receive notes before deploying your account contract**.

This works because:

- Your address is **deterministically derived** from your public keys and intended contract
- Senders can compute your address and encrypt notes for you
- You can discover and decrypt these notes once you generate your keys
- You can deploy your account contract later, funded by received notes

For example, someone could send you FeeJuice to fund your account deployment, then you deploy your account using those funds to pay gas.

## Summary

Aztec's account system represents a fundamental re-imagining of how accounts work in blockchain systems:

1. **Account contracts as entry points**: All transactions begin at an account contract's entrypoint, which validates authentication before relaying calls to application contracts

2. **Flexible validation**: Account contracts can implement any authentication mechanism, from signatures to biometrics, with unlimited complexity at no gas cost

3. **Four-key system**:

   - Nullifier keys for spending notes
   - Address keys for account identity and note encryption
   - Incoming viewing keys for receiving encrypted notes
   - Signing keys (optional) for authentication

4. **No required private keys**: Unlike Ethereum EOAs, Aztec accounts don't require traditional private keys. Authentication is programmable and can use any mechanism.

5. **AuthWit for authorization**: A powerful pattern for authorizing specific actions on your behalf, both in private and public contexts

6. **Note tagging for discovery**: An efficient system for finding encrypted notes that belong to you without brute force or offchain coordination

This architecture enables unprecedented flexibility in account management while maintaining strong privacy and security guarantees. The complexity of validation and authentication is moved to the client side, where it can be arbitrarily complex without burdening the network or creating denial-of-service risks.

## Next Steps

- Learn more about [Authentication Witnesses (AuthWit)](../../developers/docs/concepts/advanced/authwit.md)
- Explore [Key Management in Detail](../../developers/docs/concepts/accounts/keys.md)
- Understand the [Private Execution Environment (PXE)](../../developers/docs/concepts/pxe/index.md)
- See how to [implement authwit in your contracts](../../developers/docs/guides/smart_contracts/how_to_use_authwit.md)
