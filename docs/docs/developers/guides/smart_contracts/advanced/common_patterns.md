---
title: How to Implement Common Smart Contract Patterns
description: Step-by-step guide to implementing authentication, nullifiers, cross-domain data access, and other patterns in Aztec contracts.
tags: [smart-contracts, patterns, authwit, nullifiers]
---

This guide shows you how to implement common smart contract patterns in Aztec to solve specific problems.

## Prerequisites

- Aztec contract project with `aztec-nr` dependency
- Understanding of private and public execution contexts
- Familiarity with notes and nullifiers

## Implement authentication witnesses (authwit)

### Step 1: Create an authwit in private domain

```typescript
// 1. Define the action parameters
const actionValue = 9n;
const authwitNonce = Fr.random();

// 2. Create the authwit parameters
const createAuthWitParams = {
  caller: otherContract.address,
  action: myContract.methods.execute_private_action(ownerAddress, actionValue, authwitNonce),
};

// 3. Generate the authwit
const actionAuthwit = await user1Wallet.createAuthWit(createAuthWitParams);
```

### Step 2: Create an authwit in public domain

```typescript
// 1. Define the action
const action = myContract
  .withWallet(account1)
  .methods.execute_public_action(adminAddress, account1Address, value, authwitNonce);

// 2. Set the public authwit
const validateActionInteraction = await admin.setPublicAuthWit({ caller: account1Address, action }, true);

// 3. Send the transaction
await validateActionInteraction.send({ from: adminAddress }).wait();
```

## Prevent duplicate actions with nullifiers

### Step 1: Emit a nullifier in your function

```rust
pub fn verify_private_authwit(self, inner_hash: Field) -> Field {
    // 1. Compute the message hash
    let message_hash = compute_authwit_message_hash(
        self.context.msg_sender(),
        self.context.chain_id(),
        self.context.version(),
        inner_hash,
    );

    // 2. Verify the message is valid
    let valid_fn = self.is_valid_impl;
    assert(valid_fn(self.context, message_hash), "Message not authorized by account");

    // 3. Return the selector (nullifier is emitted automatically)
    IS_VALID_SELECTOR
}
```

:::warning
Ensure nullifiers include randomness to prevent preimage attacks. See [Avoid deterministic nullifiers](#avoid-deterministic-nullifiers) below.
:::

## Read public storage from private functions

### Step 1: Define public immutable storage

```rust
#[storage]
struct Storage {
  config: PublicImmutable<Config, Context>,
}
```

### Step 2: Read the value in a private function

```rust
#[private]
fn execute_private_action(
    target: AztecAddress,
    value: Field,
) -> Field {
    // Read public storage value
    let config = storage.config.read();

    // Use the value for validation
    assert_eq(config.target_contract, target, "Target address mismatch");
}
```

:::info
Only `PublicImmutable` and `DelayedPublicMutable` can be read from private functions. `PublicMutable` values change too frequently and require sequencer access.
:::

## Update public storage from private functions

### Step 1: Call an internal public function

```rust
#[private]
fn private_function(value: Field) {
    // Call public function from private
    MyContract::at(context.this_address())
        .update_public_value(value)
        .enqueue(&mut context);
}
```

### Step 2: Mark the public function as internal

```rust
#[public]
#[internal]
fn update_public_value(value: Field) {
    storage.public_value.write(value);
}
```

## Transfer public data to private domain

### Step 1: Create a note in public

```rust
#[public]
fn shield(amount: Field, secret_hash: Field) {
    // Create note with secret hash instead of owner
    let note = TransparentNote::new(amount, secret_hash);
    storage.pending_shields.insert(note);
}
```

### Step 2: Redeem in private with the secret

```rust
#[private]
fn redeem_shield(amount: Field, secret: Field) {
    // Verify the secret matches
    let secret_hash = poseidon2_hash([secret]);

    // Consume the transparent note
    let note = storage.pending_shields.get_note(secret_hash);
    storage.pending_shields.remove(note);

    // Create private note for the user
    let private_note = MyNote::new(amount, context.msg_sender());
    storage.private_balances.at(context.msg_sender()).insert(private_note);
}
```

## Ensure notes are discoverable

### Option 1: Emit encrypted logs

```rust
#[private]
fn create_note_with_log(value: Field, owner: AztecAddress) {
    let note = MyNote::new(value, owner);

    // Emit encrypted log so recipient can discover the note
    storage.notes.at(owner).insert(note).emit(
        encode_and_encrypt_note(&mut context, owner)
    );
}
```

### Option 2: Manual delivery for public-created notes

```typescript
// 1. Get transaction effects
const txEffects = await pxe.getTxEffect(txHash);

// 2. Deliver note to recipient
await contract.methods
  .deliver_note(
    contract.address,
    value,
    secretHash,
    txHash.hash,
    txEffects!.data.noteHashes,
    txEffects!.data.nullifiers[0],
    recipient,
  )
  .simulate({ from: recipient });
```

## Add randomness to notes

### Step 1: Include randomness field in note struct

```rust
#[derive(Eq, Packable)]
#[note]
pub struct MyNote {
    value: Field,
    owner: AztecAddress,
    randomness: Field,  // Required for privacy
}
```

### Step 2: Generate randomness in constructor

```rust
impl MyNote {
    pub fn new(value: Field, owner: AztecAddress) -> Self {
        // Generate randomness to prevent preimage attacks
        let randomness = unsafe { random() };
        MyNote { value, owner, randomness }
    }
}
```

## Share notes between multiple users

### Step 1: Generate a shared nullifier

```rust
#[private]
fn create_shared_note(value: Field, users: [AztecAddress; 3]) {
    // Generate random nullifier that all users will know
    let shared_nullifier = unsafe { random() };

    // Create note with shared nullifier
    let note = SharedNote::new(value, shared_nullifier);
    storage.shared_notes.insert(note);

    // Encrypt note for each user
    for user in users {
        emit_encrypted_log(&mut context, user, note);
    }
}
```

### Step 2: Allow any user to consume with the shared nullifier

```rust
#[private]
fn consume_shared_note(shared_nullifier: Field) {
    // Any user with the nullifier can consume
    let note = storage.shared_notes.get_note_by_nullifier(shared_nullifier);
    storage.shared_notes.remove(note);
}
```

## Avoid common anti-patterns

### Avoid deterministic nullifiers

**Problem**: Using predictable values for nullifiers enables preimage attacks.

**Solution**: Always include user secrets in nullifier computation:

```rust
#[private]
fn execute_once_per_user(param: Field) {
    // Get user's nullifier secret
    let msg_sender_npk_m_hash = get_public_keys(context.msg_sender()).npk_m.hash();
    let secret = context.request_nsk_app(msg_sender_npk_m_hash);

    // Derive nullifier with randomness
    let nullifier = poseidon2_hash([context.msg_sender().to_field(), secret]);
    context.push_nullifier(nullifier);
}
```

### Avoid leaking privacy in public calls

**Problem**: Passing private data to public functions reveals it.

**Solution**: Never pass sensitive parameters when calling public from private:

```rust
// Bad: Reveals sender address
#[private]
fn bad_private_to_public() {
    MyContract::at(context.this_address())
        .public_function(context.msg_sender())  // Leaks privacy!
        .enqueue(&mut context);
}

// Good: Use contract address or non-sensitive data
#[private]
fn good_private_to_public() {
    MyContract::at(context.this_address())
        .public_function(context.this_address())  // Safe
        .enqueue(&mut context);
}
```

## Next steps

- Learn about [note discovery mechanisms](../../../../aztec/concepts/advanced/storage/note_discovery.md)
- Implement [cross-chain messaging](../how_to_communicate_cross_chain.md)
- Explore [authwit in detail](../how_to_use_authwit.md)
