---
title: "Storage Types and Note Management"
description: "Working with different storage patterns and managing note lifecycles effectively in Aztec.nr contracts."
sidebar_position: 4
tags: [storage-types, note-management, private-storage, public-storage]
---

# Storage Types and Note Management

## Understanding Aztec's Storage Model

Aztec's storage system is fundamentally different from traditional smart contract storage. Instead of directly modifiable variables, Aztec uses a sophisticated system of **private notes** and **public state** that enables privacy while maintaining verifiability.

## Storage Type Overview

### Private Storage Types

**For Single Values:**
- `PrivateMutable<NoteType>` - Single private value that can be updated
- `PrivateImmutable<NoteType>` - Single private value set once

**For Collections:**
- `PrivateSet<NoteType>` - Set of private notes (like multiple token balances)
- `Map<KeyType, PrivateMutable<NoteType>>` - Key-value mapping to private notes

### Public Storage Types

**For Single Values:**
- `PublicMutable<T>` - Public state variable that can be updated
- `PublicImmutable<T>` - Public state variable set once

**For Collections:**
- `Map<KeyType, PublicMutable<T>>` - Key-value mapping to public values

## Comprehensive Storage Example

Let's build a **Private Wallet Contract** that demonstrates all storage patterns:

```rust
#[aztec]
contract PrivateWallet {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};
    use dep::address_note::{address_note::AddressNote};

    #[storage]
    struct Storage {
        // PRIVATE IMMUTABLE: Set once, never changes
        owner: PrivateImmutable<AddressNote>,
        
        // PRIVATE MUTABLE: Single value that can be updated
        spending_limit: PrivateMutable<ValueNote>,
        
        // PRIVATE SET: Collection of notes (for multiple token types)
        token_balances: Map<AztecAddress, PrivateSet<ValueNote>>,
        
        // PRIVATE MAP: User-specific private data
        user_preferences: Map<AztecAddress, PrivateMutable<ValueNote>>,
        
        // PUBLIC IMMUTABLE: Set once, publicly visible
        contract_version: PublicImmutable<Field>,
        
        // PUBLIC MUTABLE: Public state that changes
        total_users: PublicMutable<Field>,
        
        // PUBLIC MAP: Public user data
        user_status: Map<AztecAddress, PublicMutable<Field>>,
    }

    // Constructor sets immutable values
    #[public]
    fn constructor(owner: AztecAddress, version: Field) {
        // Set public immutable
        storage.contract_version.initialize(version);
        
        // Set initial public state
        storage.total_users.write(0);
        
        // Set private immutable (in a private function)
        PrivateWallet::at(context.this_address())._initialize_owner(owner).enqueue(&mut context);
    }

    #[private]
    internal fn _initialize_owner(owner: AztecAddress) {
        storage.owner.initialize(AddressNote::new(owner, owner));
    }

    // PRIVATE IMMUTABLE EXAMPLE
    #[private]
    fn get_owner() -> AztecAddress {
        storage.owner.get_note().address
    }

    // PRIVATE MUTABLE EXAMPLE  
    #[private]
    fn set_spending_limit(user: AztecAddress, limit: Field) {
        // Verify user is setting their own limit
        assert(user == context.msg_sender());
        
        // Update the spending limit (replaces old note)
        storage.spending_limit.replace(ValueNote::new(limit, user));
    }

    #[private]
    fn get_spending_limit(user: AztecAddress) -> Field {
        assert(user == context.msg_sender());
        
        if storage.spending_limit.is_initialized() {
            storage.spending_limit.get_note().value
        } else {
            0 // Default spending limit
        }
    }

    // PRIVATE SET EXAMPLE
    #[private]
    fn deposit_tokens(user: AztecAddress, token: AztecAddress, amount: Field) {
        assert(user == context.msg_sender());
        
        // Add new note to the set (doesn't replace, adds to collection)
        storage.token_balances.at(token).insert(ValueNote::new(amount, user));
        
        // Update public user count if first deposit
        PrivateWallet::at(context.this_address())._maybe_increment_users().enqueue(&mut context);
    }

    #[private]
    fn withdraw_tokens(user: AztecAddress, token: AztecAddress, amount: Field) {
        assert(user == context.msg_sender());
        
        // Get user's notes for this token
        let user_notes = storage.token_balances.at(token).pop_notes(amount);
        
        // Verify user has sufficient balance
        let mut total = 0;
        for i in 0..user_notes.len() {
            if i < user_notes.len() {
                total += user_notes[i].value;
            }
        }
        assert(total >= amount);
        
        // Create change note if necessary
        if total > amount {
            let change = total - amount;
            storage.token_balances.at(token).insert(ValueNote::new(change, user));
        }
    }

    #[private]
    fn get_token_balance(user: AztecAddress, token: AztecAddress) -> Field {
        assert(user == context.msg_sender());
        
        // Sum all notes for this token
        storage.token_balances.at(token).get_notes(GetNotesOptions::new()).fold(0, |sum, note| sum + note.value)
    }

    // PUBLIC STORAGE EXAMPLES
    #[public]
    internal fn _maybe_increment_users() {
        // This would need more logic to track unique users
        let current = storage.total_users.read();
        storage.total_users.write(current + 1);
    }

    #[public]
    fn get_total_users() -> Field {
        storage.total_users.read()
    }

    #[public]
    fn set_user_status(user: AztecAddress, status: Field) {
        // Only user can set their own status
        assert(user == context.msg_sender());
        storage.user_status.at(user).write(status);
    }

    #[public]
    fn get_user_status(user: AztecAddress) -> Field {
        storage.user_status.at(user).read()
    }
}
```

## Understanding Each Storage Type

### PrivateImmutable<NoteType>

**Purpose:** Store a private value that never changes after initialization.

```rust
// Declaration
owner: PrivateImmutable<AddressNote>,

// Initialization (only once)
storage.owner.initialize(AddressNote::new(owner_address, owner_address));

// Reading
let owner_address = storage.owner.get_note().address;
```

**Use Cases:**
- Contract owner
- Configuration parameters
- Initial settings
- Identity information

**Key Properties:**
- Set once during initialization
- Cannot be changed afterward
- Privately readable by authorized parties
- Efficient for frequently accessed constants

### PrivateMutable<NoteType>

**Purpose:** Store a single private value that can be updated.

```rust
// Declaration
spending_limit: PrivateMutable<ValueNote>,

// Reading (with existence check)
let limit = if storage.spending_limit.is_initialized() {
    storage.spending_limit.get_note().value
} else {
    0 // Default value
};

// Updating (replaces old note)
storage.spending_limit.replace(ValueNote::new(new_limit, user));
```

**Note Lifecycle:**
1. **Initialize:** Create first note
2. **Update:** Replace old note with new note (old note gets nullified)
3. **Read:** Get current note value

**Use Cases:**
- User preferences
- Current balances
- Status indicators
- Configuration settings

### PrivateSet<NoteType>

**Purpose:** Manage a collection of private notes (like multiple UTXOs).

```rust
// Declaration
token_balances: Map<AztecAddress, PrivateSet<ValueNote>>,

// Adding notes (accumulates)
storage.token_balances.at(token_address).insert(ValueNote::new(amount, user));

// Reading notes
let notes = storage.token_balances.at(token_address).get_notes(GetNotesOptions::new());

// Spending notes (removes specific notes)
let spent_notes = storage.token_balances.at(token_address).pop_notes(amount_to_spend);

// Calculating total
let total = notes.fold(0, |sum, note| sum + note.value);
```

**Note Management:**
- `insert()` - Add new notes to the set
- `pop_notes(amount)` - Remove notes totaling at least the specified amount
- `get_notes()` - Retrieve notes for reading (doesn't spend them)

**Use Cases:**
- Token balances (multiple denominations)
- Transaction history
- Multiple asset holdings
- Collectible items (NFTs)

### Public Storage Types

**PublicMutable<T> Example:**
```rust
// Declaration
total_users: PublicMutable<Field>,

// Reading
let count = storage.total_users.read();

// Writing
storage.total_users.write(new_count);
```

**PublicImmutable<T> Example:**
```rust
// Declaration
contract_version: PublicImmutable<Field>,

// Initialization (only once)
storage.contract_version.initialize(1);

// Reading
let version = storage.contract_version.read();
```

## Advanced Note Patterns

### Pattern 1: Note Splitting

When you have large notes and need smaller amounts:

```rust
#[private]
fn spend_partial_amount(user: AztecAddress, token: AztecAddress, spend_amount: Field) {
    assert(user == context.msg_sender());
    
    // Get a note larger than spend_amount
    let notes = storage.token_balances.at(token).pop_notes(spend_amount);
    
    let mut total = 0;
    for i in 0..notes.len() {
        if i < notes.len() {
            total += notes[i].value;
        }
    }
    
    // Create change note if we have excess
    if total > spend_amount {
        let change = total - spend_amount;
        storage.token_balances.at(token).insert(ValueNote::new(change, user));
    }
    
    // The difference (spend_amount) is effectively "spent"
}
```

### Pattern 2: Note Consolidation

Combining multiple small notes into larger ones for efficiency:

```rust
#[private]
fn consolidate_notes(user: AztecAddress, token: AztecAddress) {
    assert(user == context.msg_sender());
    
    // Get all notes for this token
    let all_notes = storage.token_balances.at(token).get_notes(GetNotesOptions::new());
    
    // Calculate total value
    let total = all_notes.fold(0, |sum, note| sum + note.value);
    
    // Remove all existing notes
    storage.token_balances.at(token).remove_notes(all_notes);
    
    // Create single consolidated note
    storage.token_balances.at(token).insert(ValueNote::new(total, user));
}
```

### Pattern 3: Conditional Note Creation

Creating notes based on conditions:

```rust
#[private]
fn conditional_reward(user: AztecAddress, achievement_level: Field) {
    assert(user == context.msg_sender());
    
    let reward_amount = if achievement_level >= 10 {
        100 // Gold level reward
    } else if achievement_level >= 5 {
        50  // Silver level reward
    } else {
        0   // No reward
    };
    
    if reward_amount > 0 {
        storage.token_balances.at(reward_token()).insert(
            ValueNote::new(reward_amount, user)
        );
    }
}
```

## Storage Access Patterns

### Safe Reading with Existence Checks

```rust
#[private]
fn safe_read_private_value(user: AztecAddress) -> Field {
    if storage.user_data.at(user).is_initialized() {
        storage.user_data.at(user).get_note().value
    } else {
        // Return default value instead of failing
        0
    }
}
```

### Batch Operations

```rust
#[private]
fn batch_deposit(user: AztecAddress, amounts: [Field; 5]) {
    assert(user == context.msg_sender());
    
    for i in 0..5 {
        if amounts[i] > 0 {
            storage.token_balances.at(default_token()).insert(
                ValueNote::new(amounts[i], user)
            );
        }
    }
}
```

### Cross-Storage Validation

```rust
#[private]
fn validated_spend(user: AztecAddress, amount: Field) {
    assert(user == context.msg_sender());
    
    // Check private spending limit
    let limit = if storage.spending_limits.at(user).is_initialized() {
        storage.spending_limits.at(user).get_note().value
    } else {
        1000 // Default limit
    };
    
    assert(amount <= limit);
    
    // Proceed with spending
    let notes = storage.balances.at(user).pop_notes(amount);
    // ... rest of spending logic
}
```

## Common Storage Mistakes

### Mistake 1: Not Checking Note Existence
```rust
// ❌ Wrong - will fail if note doesn't exist
let value = storage.user_data.at(user).get_note().value;

// ✅ Correct - check existence first
let value = if storage.user_data.at(user).is_initialized() {
    storage.user_data.at(user).get_note().value
} else {
    0
};
```

### Mistake 2: Confusing Insert vs Replace
```rust
// ❌ Wrong - replace() on PrivateSet (use insert())
storage.token_notes.at(token).replace(note); // This won't work

// ✅ Correct - insert() for PrivateSet
storage.token_notes.at(token).insert(note);

// ✅ Correct - replace() for PrivateMutable
storage.single_value.replace(note);
```

### Mistake 3: Not Handling Insufficient Balance
```rust
// ❌ Wrong - no validation
let notes = storage.balances.pop_notes(amount);

// ✅ Correct - validate sufficient balance
let notes = storage.balances.pop_notes(amount);
let total = notes.fold(0, |sum, note| sum + note.value);
assert(total >= amount);
```

## Testing Storage Patterns

```typescript
describe('Storage Patterns', () => {
  test('private mutable storage', async () => {
    // Set spending limit
    await contract.methods.set_spending_limit(alice.address, 1000n).send().wait();
    
    // Read spending limit (only Alice can see)
    const limit = await contract.methods
      .get_spending_limit(alice.address)
      .simulate({ from: alice });
    
    expect(limit).toBe(1000n);
  });

  test('private set storage', async () => {
    // Deposit tokens multiple times
    await contract.methods.deposit_tokens(alice.address, token.address, 100n).send().wait();
    await contract.methods.deposit_tokens(alice.address, token.address, 200n).send().wait();
    
    // Check total balance
    const balance = await contract.methods
      .get_token_balance(alice.address, token.address)
      .simulate({ from: alice });
    
    expect(balance).toBe(300n);
  });

  test('public storage visibility', async () => {
    // Public storage is visible to everyone
    const totalUsers = await contract.methods.get_total_users().simulate();
    const version = await contract.methods.get_contract_version().simulate();
    
    expect(totalUsers).toBeGreaterThanOrEqual(0n);
    expect(version).toBeDefined();
  });
});
```

## Key Takeaways

1. **Choose storage types based on access patterns** - mutable vs immutable, single vs collection
2. **Private storage uses notes, public storage uses direct values** - fundamentally different models
3. **Always check note existence before reading** - prevents runtime failures
4. **PrivateSet for collections, PrivateMutable for single values** - use the right type for your use case
5. **Note management requires careful balance tracking** - validate sufficient funds before spending
6. **Public storage is immediately visible, private storage requires note discovery** - affects user experience design

---

## Phase 5 Complete!

Congratulations! You've completed Phase 5 of your Aztec learning journey. You now understand:

✅ **Development environment setup** - tools and workflow for Aztec.nr development  
✅ **Private contract development** - building contracts that manage private state  
✅ **Private vs public function design** - choosing the right execution context  
✅ **Storage patterns and note management** - working with Aztec's sophisticated storage model  

## What's Next?

You now have the practical skills to build basic privacy-preserving smart contracts! Phase 6 will teach you intermediate patterns and best practices for building more sophisticated privacy applications.

**Continue to:** [Phase 6: Privacy Development Patterns →](/aztec/learning_journey/phase_6)

---

**Phase 5 Navigation:**  
[← Private vs Public Functions](/aztec/learning_journey/phase_5/private_vs_public) | **Storage and Notes** | *Phase 5 Complete!*

---

*Return to [Phase 5 Overview](/aztec/learning_journey/phase_5) or [Full Learning Journey](/aztec/learning_journey)*