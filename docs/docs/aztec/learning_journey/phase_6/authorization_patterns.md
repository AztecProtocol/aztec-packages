---
title: "Authorization Patterns and AuthWit"
description: "Implementing secure, flexible authorization systems for private operations using AuthWit and other patterns."
sidebar_position: 1
tags: [authorization, authwit, permissions, security, delegation]
---

# Authorization Patterns and AuthWit

## The Authorization Challenge

In privacy-preserving systems, authorization becomes complex because traditional "check if the caller is authorized" patterns don't work when operations involve private state. **AuthWit** (Authentication Witness) is Aztec's solution for secure, privacy-preserving authorization.

## Understanding AuthWit

### What is AuthWit?

**AuthWit** is a cryptographic witness that proves someone has authorized a specific action without revealing the authorization details publicly.

Think of it like a **cryptographic permission slip** that says:
- "Alice authorizes Bob to spend 100 of her tokens"
- "This authorization is valid for token contract X"
- "The authorization can only be used once"

### Why Not Simple Address Checks?

```rust
// ❌ This doesn't work well in privacy contexts
#[private]
fn spend_tokens(owner: AztecAddress, amount: Field) {
    assert(context.msg_sender() == owner); // Too restrictive
}
```

**Problems with simple checks:**
- No delegation possible (only owner can spend)
- No fine-grained permissions
- No temporary authorizations
- No cross-contract authorization

## Basic AuthWit Pattern

Let's build a **Private Token** contract that demonstrates AuthWit:

```rust
#[aztec]
contract PrivateToken {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]  
    struct Storage {
        balances: Map<AztecAddress, PrivateSet<ValueNote>>,
    }

    #[private]
    fn mint(to: AztecAddress, amount: Field) {
        storage.balances.at(to).insert(ValueNote::new(amount, to));
    }

    #[private]
    fn transfer(from: AztecAddress, to: AztecAddress, amount: Field) {
        // Check if caller is authorized to spend from's tokens
        if from != context.msg_sender() {
            // Verify AuthWit - proves 'from' authorized this specific transfer
            verify_authwit(from, context.msg_sender(), amount);
        }

        // Execute the transfer
        let from_notes = storage.balances.at(from).pop_notes(amount);
        let total = from_notes.fold(0, |sum, note| sum + note.value);
        assert(total >= amount);

        // Create note for recipient
        storage.balances.at(to).insert(ValueNote::new(amount, to));

        // Create change note if necessary
        if total > amount {
            storage.balances.at(from).insert(ValueNote::new(total - amount, from));
        }
    }

    // Helper function to verify authorization witness
    fn verify_authwit(authorizer: AztecAddress, authorized: AztecAddress, amount: Field) {
        // Create message hash that represents this specific authorization
        let message_hash = compute_authwit_message_hash(
            authorized,      // Who is authorized
            context.this_address(), // Which contract
            context.function_selector(), // Which function
            [amount.to_field()] // Function arguments
        );

        // Verify the authorization witness
        assert(
            verify_authwit_private(authorizer, message_hash)
        );
    }

    #[private]
    fn balance_of(owner: AztecAddress) -> Field {
        assert(owner == context.msg_sender());
        storage.balances.at(owner).get_notes(GetNotesOptions::new()).fold(0, |sum, note| sum + note.value)
    }
}
```

## AuthWit Creation and Usage

### Creating an AuthWit

```typescript
// Alice wants to authorize Bob to spend 100 tokens on her behalf
const authwitMessage = await computeAuthWitMessageHash(
  bob.address,           // Who is authorized
  tokenContract.address, // Which contract
  transferSelector,      // Which function (transfer)
  [alice.address, bob.address, 100n] // Function arguments
);

// Alice creates the authorization witness
const authwit = await alice.createAuthWit(authwitMessage);

// Alice shares this authwit with Bob (or stores it for Bob to use)
```

### Using an AuthWit

```typescript
// Bob can now transfer Alice's tokens using the authwit
await tokenContract.methods
  .transfer(alice.address, charlie.address, 100n)
  .send({ from: bob })
  .wait();

// The contract will automatically verify Bob's authorization
```

## Advanced Authorization Patterns

### Pattern 1: Spending Allowances

Build a system where users can set spending limits for others:

```rust
#[aztec]
contract TokenWithAllowances {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]
    struct Storage {
        balances: Map<AztecAddress, PrivateSet<ValueNote>>,
        allowances: Map<Field, PrivateMutable<ValueNote>>, // Hash of (owner,spender) -> amount
    }

    #[private]
    fn set_allowance(owner: AztecAddress, spender: AztecAddress, amount: Field) {
        assert(owner == context.msg_sender());
        
        let allowance_key = pedersen_hash([owner.to_field(), spender.to_field()]);
        storage.allowances.at(allowance_key).replace(ValueNote::new(amount, owner));
    }

    #[private]
    fn transfer_from(owner: AztecAddress, spender: AztecAddress, to: AztecAddress, amount: Field) {
        // If spender is not the owner, check allowance
        if spender != owner {
            let allowance_key = pedersen_hash([owner.to_field(), spender.to_field()]);
            
            // Check current allowance
            let current_allowance = if storage.allowances.at(allowance_key).is_initialized() {
                storage.allowances.at(allowance_key).get_note().value
            } else {
                0
            };
            
            assert(current_allowance >= amount);
            
            // Reduce allowance
            storage.allowances.at(allowance_key).replace(
                ValueNote::new(current_allowance - amount, owner)
            );
        }

        // Execute transfer (same as before)
        let owner_notes = storage.balances.at(owner).pop_notes(amount);
        let total = owner_notes.fold(0, |sum, note| sum + note.value);
        assert(total >= amount);

        storage.balances.at(to).insert(ValueNote::new(amount, to));
        
        if total > amount {
            storage.balances.at(owner).insert(ValueNote::new(total - amount, owner));
        }
    }

    #[private]
    fn get_allowance(owner: AztecAddress, spender: AztecAddress) -> Field {
        // Only owner or spender can check allowance
        assert(context.msg_sender() == owner || context.msg_sender() == spender);
        
        let allowance_key = pedersen_hash([owner.to_field(), spender.to_field()]);
        
        if storage.allowances.at(allowance_key).is_initialized() {
            storage.allowances.at(allowance_key).get_note().value
        } else {
            0
        }
    }
}
```

### Pattern 2: Time-Limited Authorizations

```rust
#[aztec]
contract TimeLimitedToken {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]
    struct Storage {
        balances: Map<AztecAddress, PrivateSet<ValueNote>>,
        timed_approvals: Map<Field, PrivateMutable<ValueNote>>, // Stores expiry times
    }

    #[private]
    fn approve_with_deadline(
        owner: AztecAddress, 
        spender: AztecAddress, 
        amount: Field, 
        deadline: Field
    ) {
        assert(owner == context.msg_sender());
        
        let approval_key = pedersen_hash([
            owner.to_field(), 
            spender.to_field(),
            context.this_address().to_field()
        ]);
        
        // Store approval with deadline
        storage.timed_approvals.at(approval_key).replace(
            ValueNote::new(deadline, owner)
        );
        
        // Also set the allowance amount (reusing previous pattern)
        let allowance_key = pedersen_hash([owner.to_field(), spender.to_field()]);
        storage.allowances.at(allowance_key).replace(ValueNote::new(amount, owner));
    }

    #[private]  
    fn transfer_with_time_check(
        owner: AztecAddress,
        spender: AztecAddress, 
        to: AztecAddress, 
        amount: Field
    ) {
        if spender != owner {
            // Check time limit
            let approval_key = pedersen_hash([
                owner.to_field(), 
                spender.to_field(),
                context.this_address().to_field()
            ]);
            
            assert(storage.timed_approvals.at(approval_key).is_initialized());
            let deadline = storage.timed_approvals.at(approval_key).get_note().value;
            
            // Note: In real implementation, you'd need to get current timestamp
            // This is a simplified example
            assert(context.timestamp() <= deadline);
        }

        // Continue with regular transfer logic...
    }
}
```

### Pattern 3: Multi-Signature Authorization

```rust
#[aztec]
contract MultiSigToken {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]
    struct Storage {
        balances: Map<AztecAddress, PrivateSet<ValueNote>>,
        multisig_configs: Map<AztecAddress, PrivateMutable<ValueNote>>, // Required signatures
        pending_transfers: Map<Field, PrivateSet<ValueNote>>, // Pending multi-sig transfers
    }

    #[private]
    fn setup_multisig(owner: AztecAddress, required_sigs: Field) {
        assert(owner == context.msg_sender());
        storage.multisig_configs.at(owner).replace(ValueNote::new(required_sigs, owner));
    }

    #[private]
    fn initiate_multisig_transfer(
        owner: AztecAddress,
        to: AztecAddress, 
        amount: Field,
        transfer_id: Field
    ) {
        // Verify caller is authorized to initiate
        // This could use AuthWit or be the owner themselves
        
        // Create pending transfer record
        let transfer_data = encode_transfer_data(owner, to, amount);
        storage.pending_transfers.at(transfer_id).insert(
            ValueNote::new(transfer_data, context.msg_sender())
        );
    }

    #[private]
    fn sign_transfer(transfer_id: Field, signer: AztecAddress) {
        assert(signer == context.msg_sender());
        
        // Add signature to pending transfer
        storage.pending_transfers.at(transfer_id).insert(
            ValueNote::new(signer.to_field(), signer)
        );
    }

    #[private]
    fn execute_multisig_transfer(transfer_id: Field) {
        // Get all signatures for this transfer
        let signatures = storage.pending_transfers.at(transfer_id).get_notes(GetNotesOptions::new());
        
        // Extract transfer details and verify sufficient signatures
        // (Implementation details omitted for brevity)
        
        // Execute the transfer if requirements are met
        // ... transfer logic here
    }

    fn encode_transfer_data(owner: AztecAddress, to: AztecAddress, amount: Field) -> Field {
        // Create a hash that represents the transfer
        pedersen_hash([owner.to_field(), to.to_field(), amount])
    }
}
```

## Cross-Contract Authorization

### Authorizing Other Contracts

```rust
#[aztec]
contract TokenUser {
    use dep::aztec::prelude::*;

    #[private]
    fn use_tokens_via_defi(
        token_contract: AztecAddress,
        defi_contract: AztecAddress, 
        amount: Field
    ) {
        // Create AuthWit for DeFi contract to spend our tokens
        let message_hash = compute_authwit_message_hash(
            defi_contract,
            token_contract,
            transfer_selector(),
            [context.msg_sender().to_field(), defi_contract.to_field(), amount]
        );

        // Create and store the authwit
        create_authwit_private(context.msg_sender(), message_hash);

        // Call DeFi contract which will spend our tokens
        let defi = DeFiContract::at(defi_contract);
        defi.deposit_tokens(token_contract, amount).call(&mut context);
    }
}
```

## Testing Authorization Patterns

```typescript
describe('Authorization Patterns', () => {
  test('basic authwit transfer', async () => {
    // Alice mints tokens
    await token.methods.mint(alice.address, 1000n).send().wait();

    // Alice authorizes Bob to spend 100 tokens
    const message = await computeAuthWitMessageHash(
      bob.address,
      token.address, 
      transferSelector,
      [alice.address, charlie.address, 100n]
    );

    await alice.setPublicAuthWit(message, true).send().wait();

    // Bob transfers Alice's tokens to Charlie
    await token.methods
      .transfer(alice.address, charlie.address, 100n)
      .send({ from: bob })
      .wait();

    // Verify transfer worked
    const charlieBalance = await token.methods
      .balance_of(charlie.address)
      .simulate({ from: charlie });
    
    expect(charlieBalance).toBe(100n);
  });

  test('allowance-based spending', async () => {
    // Alice sets allowance for Bob
    await token.methods
      .set_allowance(alice.address, bob.address, 500n)
      .send({ from: alice })
      .wait();

    // Bob can spend within allowance
    await token.methods
      .transfer_from(alice.address, bob.address, charlie.address, 200n)
      .send({ from: bob })
      .wait();

    // Check remaining allowance
    const remaining = await token.methods
      .get_allowance(alice.address, bob.address)
      .simulate({ from: bob });
      
    expect(remaining).toBe(300n);
  });

  test('unauthorized transfer should fail', async () => {
    await expect(
      token.methods
        .transfer(alice.address, charlie.address, 100n)
        .send({ from: bob })
        .wait()
    ).rejects.toThrow();
  });
});
```

## Authorization Best Practices

### 1. Principle of Least Privilege
```rust
// ✅ Good - specific, limited authorization
fn approve_specific_action(spender: AztecAddress, amount: Field, action_id: Field) {
    let message = compute_specific_authwit(spender, action_id, amount);
    create_authwit_private(context.msg_sender(), message);
}

// ❌ Avoid - overly broad authorization
fn approve_all_actions(spender: AztecAddress) {
    // Too permissive - gives unlimited access
}
```

### 2. Time-Bound Authorizations
```rust
// ✅ Good - authorization expires
fn approve_with_expiry(spender: AztecAddress, amount: Field, expiry: Field) {
    assert(expiry > context.timestamp());
    // Store authorization with expiry time
}
```

### 3. Revokable Permissions
```rust
// ✅ Good - ability to revoke
#[private]
fn revoke_approval(owner: AztecAddress, spender: AztecAddress) {
    assert(owner == context.msg_sender());
    
    let allowance_key = pedersen_hash([owner.to_field(), spender.to_field()]);
    storage.allowances.at(allowance_key).replace(ValueNote::new(0, owner));
}
```

### 4. Clear Authorization Scope
```rust
// ✅ Good - clear what's being authorized
struct TransferAuth {
    from: AztecAddress,
    to: AztecAddress, 
    amount: Field,
    token_contract: AztecAddress,
    expiry: Field,
}

// ❌ Avoid - unclear authorization scope
struct GenericAuth {
    authorized: AztecAddress,
    permission_level: Field, // What does this mean?
}
```

## Common Authorization Mistakes

### Mistake 1: Not Validating Authorization Scope
```rust
// ❌ Wrong - doesn't validate what's being authorized
fn spend_tokens(amount: Field) {
    // Missing: check if caller is authorized for this specific amount
}

// ✅ Correct - validates specific authorization
fn spend_tokens(owner: AztecAddress, amount: Field) {
    if owner != context.msg_sender() {
        verify_authwit(owner, context.msg_sender(), amount);
    }
}
```

### Mistake 2: Reusable Authorizations
```rust
// ❌ Wrong - authorization can be replayed
fn create_generic_authwit(spender: AztecAddress) {
    let message = pedersen_hash([spender.to_field()]);
    create_authwit_private(context.msg_sender(), message);
}

// ✅ Correct - specific, one-time authorization
fn create_specific_authwit(spender: AztecAddress, action: Field, nonce: Field) {
    let message = pedersen_hash([spender.to_field(), action, nonce]);
    create_authwit_private(context.msg_sender(), message);
}
```

### Mistake 3: Missing Access Control on Authorization
```rust
// ❌ Wrong - anyone can create authorizations
fn approve_spender(owner: AztecAddress, spender: AztecAddress, amount: Field) {
    // Missing: assert(owner == context.msg_sender());
}

// ✅ Correct - only owner can authorize
fn approve_spender(owner: AztecAddress, spender: AztecAddress, amount: Field) {
    assert(owner == context.msg_sender());
    // Now safe to create authorization
}
```

## Key Takeaways

1. **AuthWit enables flexible, secure authorization** - beyond simple address checks
2. **Authorizations should be specific and limited** - follow principle of least privilege  
3. **Consider time limits and revocation** - authorizations shouldn't last forever
4. **Test authorization edge cases thoroughly** - security depends on correct implementation
5. **Multi-signature patterns add security** - for high-value operations
6. **Cross-contract authorization enables composability** - while maintaining security

---

## Next Steps

Now that you understand authorization patterns, let's explore how contracts can communicate with each other while maintaining privacy.

**Continue to:** [Cross-Contract Communication →](/aztec/learning_journey/phase_6/cross_contract)

---

**Phase 6 Navigation:**  
← *Phase 6 Overview* | **Authorization Patterns** | [Cross-Contract Communication →](/aztec/learning_journey/phase_6/cross_contract)