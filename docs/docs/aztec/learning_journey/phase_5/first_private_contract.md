---
title: "Your First Private Contract"
description: "Building an enhanced counter contract that demonstrates private state management and core Aztec.nr concepts."
sidebar_position: 2
tags: [first-contract, counter-contract, private-state, aztec-nr]
---

# Your First Private Contract

## Building a Private Counter Contract

Let's build your first Aztec.nr contract! We'll create a **Private Counter** that demonstrates the fundamental concepts you've learned. This isn't just a basic counter - it's a privacy-preserving counter where each user has their own private count that only they can see.

## Contract Overview

Our Private Counter will have these features:
- **Private counters** - Each user has their own hidden counter value
- **Private increments** - Increment operations happen privately
- **Private reads** - Only you can see your counter value
- **Ownership verification** - Only the counter owner can increment it

## The Complete Contract

Let's start with the full contract and then break it down:

```rust
// src/main.nr
#[aztec]
contract PrivateCounter {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]
    struct Storage {
        counters: Map<AztecAddress, PrivateMutable<ValueNote>>,
    }

    #[private]
    fn increment(owner: AztecAddress) {
        // Get the current counter value (or 0 if doesn't exist)
        let current_value = storage.counters.at(owner).get_note(true).value;
        
        // Create a new note with incremented value
        let new_value = current_value + 1;
        
        // Replace the old note with the new one
        storage.counters.at(owner).replace(ValueNote::new(new_value, owner));
    }

    #[private] 
    fn get_counter(owner: AztecAddress) -> Field {
        // Only the owner can read their counter
        assert(owner == context.msg_sender());
        
        // Return the current counter value
        storage.counters.at(owner).get_note(true).value
    }

    #[private]
    fn increment_by(owner: AztecAddress, amount: Field) {
        // Verify only the owner can increment their counter
        assert(owner == context.msg_sender());
        
        // Get current value
        let current_value = storage.counters.at(owner).get_note(true).value;
        
        // Increment by specified amount
        let new_value = current_value + amount;
        
        // Replace with new note
        storage.counters.at(owner).replace(ValueNote::new(new_value, owner));
    }
}
```

## Breaking Down the Contract

### 1. Contract Declaration and Imports

```rust
#[aztec]
contract PrivateCounter {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};
```

**Key Points:**
- `#[aztec]` - Tells the compiler this is an Aztec contract
- `dep::aztec::prelude::*` - Imports all core Aztec functionality
- `ValueNote` - A simple note type that stores a field value and owner

### 2. Storage Definition

```rust
#[storage]
struct Storage {
    counters: Map<AztecAddress, PrivateMutable<ValueNote>>,
}
```

**Understanding the Storage:**
- `Map<AztecAddress, PrivateMutable<ValueNote>>` - Each address maps to a private note
- `PrivateMutable` - Private storage that can be updated
- `ValueNote` - Contains the counter value and ownership information

**Privacy Implications:**
- Each user's counter is stored as an encrypted note
- Only the owner can decrypt and read their counter value
- The mapping structure is private - observers can't see who has counters

### 3. Private Functions

#### Basic Increment Function

```rust
#[private]
fn increment(owner: AztecAddress) {
    let current_value = storage.counters.at(owner).get_note(true).value;
    let new_value = current_value + 1;
    storage.counters.at(owner).replace(ValueNote::new(new_value, owner));
}
```

**What Happens Here:**
1. **Read current note:** `get_note(true)` retrieves the current counter note
2. **Calculate new value:** Simple increment by 1
3. **Replace note:** Creates new note with incremented value

**Privacy Magic:**
- This entire operation happens on your device (PXE)
- Only generates a proof that the operation was valid
- The increment amount and final value remain private

#### Counter Reading Function

```rust
#[private] 
fn get_counter(owner: AztecAddress) -> Field {
    assert(owner == context.msg_sender());
    storage.counters.at(owner).get_note(true).value
}
```

**Security Check:**
- `assert(owner == context.msg_sender())` - Only the owner can read their counter
- Prevents others from reading your private counter value

#### Flexible Increment Function

```rust
#[private]
fn increment_by(owner: AztecAddress, amount: Field) {
    assert(owner == context.msg_sender());
    let current_value = storage.counters.at(owner).get_note(true).value;
    let new_value = current_value + amount;
    storage.counters.at(owner).replace(ValueNote::new(new_value, owner));
}
```

**Added Features:**
- Increment by any amount (not just 1)
- Owner verification for security
- Same privacy properties as basic increment

## Understanding Note Lifecycle

Let's trace what happens when Alice increments her counter:

### Initial State
```
Alice's Storage: No note exists yet
Note Hash Tree: [...existing commitments...]
Nullifier Tree: [...existing nullifiers...]
```

### After First Increment
```
Alice's PXE:
├── Creates: ValueNote { value: 1, owner: Alice }
├── Generates: Note commitment = hash(1 + Alice + nonce)
├── Stores: Note locally for future access
└── Submits: Commitment to network

Network State:
├── Note Hash Tree: [..., Alice's note commitment, ...]
├── Alice's note is encrypted - only she can decrypt it
└── Observers see a new commitment appeared, but nothing else
```

### After Second Increment  
```
Alice's PXE:
├── Nullifies: Old note (value: 1)
├── Creates: New note (value: 2)  
├── Generates: Nullifier for old note
├── Generates: Commitment for new note
└── Submits: Both to network

Network State:
├── Note Hash Tree: [..., old commitment, new commitment, ...]
├── Nullifier Tree: [..., nullifier for old note, ...]
├── Old note can never be used again
└── New note represents current counter value
```

## Compiling and Testing

### Compile the Contract

```bash
# Compile your contract
aztec-nargo compile

# Generate TypeScript interfaces
aztec codegen target --outdir src/artifacts
```

### Basic Test

Create a test file:

```typescript
// tests/counter.test.ts
import { 
  AztecAddress, 
  Contract, 
  PXE, 
  Wallet, 
  createPXEClient, 
  getInitialTestAccountsWallets 
} from '@aztec/aztec.js';
import { PrivateCounterContract } from '../src/artifacts/PrivateCounter.js';

describe('PrivateCounter', () => {
  let pxe: PXE;
  let wallet: Wallet;
  let contract: PrivateCounterContract;
  let owner: AztecAddress;

  beforeAll(async () => {
    pxe = createPXEClient(process.env.PXE_URL || 'http://localhost:8080');
    const wallets = await getInitialTestAccountsWallets(pxe);
    wallet = wallets[0];
    owner = wallet.getAddress();

    // Deploy the contract
    contract = await PrivateCounterContract.deploy(wallet).send().deployed();
  });

  test('should increment private counter', async () => {
    // Increment the counter
    await contract.methods.increment(owner).send().wait();
    
    // Read the counter (only owner can do this)
    const count = await contract.methods.get_counter(owner).simulate();
    expect(count).toBe(1n);
  });

  test('should increment by custom amount', async () => {
    // Increment by 5
    await contract.methods.increment_by(owner, 5n).send().wait();
    
    // Read the updated counter
    const count = await contract.methods.get_counter(owner).simulate();
    expect(count).toBe(6n); // Previous 1 + 5 = 6
  });
});
```

### Run the Test

```bash
# Run your tests
npm test
```

## Privacy Properties Demonstrated

### What Remains Private

**Alice's Perspective:**
- She knows her counter value is 6
- She knows she's incremented it several times
- She can see her complete counter history

**Bob's Perspective (Another User):**
- He can see new note commitments appeared
- He can see some nullifiers were created
- He **cannot** see Alice's counter value
- He **cannot** link the commitments to Alice
- He **cannot** determine how many times Alice incremented

**Network Observer's Perspective:**
- Sees note commitments being added to the tree
- Sees nullifiers being added to the tree  
- Sees valid zero-knowledge proofs being submitted
- **Cannot** determine who owns which notes
- **Cannot** determine note values
- **Cannot** link increments to specific users

### What's Public

**Public Information:**
- A private counter contract exists at a specific address
- Valid transactions are being processed
- The contract logic is publicly verifiable
- State tree updates are happening correctly

## Key Aztec.nr Concepts Demonstrated

### 1. Private Storage Patterns
```rust
Map<AztecAddress, PrivateMutable<ValueNote>>
```
- Maps addresses to private notes
- Each user gets their own private storage slot
- Storage is encrypted and access-controlled

### 2. Note-Based State Management
```rust
storage.counters.at(owner).replace(ValueNote::new(new_value, owner))
```
- State updates create new notes and nullify old ones
- No direct state modification (like `counter += 1`)
- Maintains privacy through note encryption

### 3. Access Control
```rust
assert(owner == context.msg_sender())
```
- Cryptographic access control in private functions
- Only the authorized user can perform operations
- Enforced through zero-knowledge proofs

### 4. Private Function Execution
```rust
#[private]
fn increment(owner: AztecAddress)
```
- Executes on user's device (PXE)
- Generates proofs of correct execution
- Private data never leaves user's device

## Common Beginner Mistakes

### Mistake 1: Trying to Return Private Data from Private Functions
```rust
// ❌ Wrong - private data can't be returned directly
#[private]
fn get_counter_wrong(owner: AztecAddress) -> Field {
    storage.counters.at(owner).get_note(true).value // This won't work as expected
}

// ✅ Correct - use simulate() to read private data locally
// In TypeScript: contract.methods.get_counter(owner).simulate()
```

### Mistake 2: Not Handling Non-Existent Notes
```rust
// ❌ Wrong - will fail if no note exists yet
let value = storage.counters.at(owner).get_note(true).value;

// ✅ Better - handle the case where no note exists
let current_value = if (storage.counters.at(owner).is_initialized()) {
    storage.counters.at(owner).get_note(true).value
} else {
    0
};
```

### Mistake 3: Forgetting Access Control
```rust
// ❌ Wrong - anyone could increment anyone's counter
#[private]
fn increment_unsafe(owner: AztecAddress) {
    // No verification that msg_sender == owner
}

// ✅ Correct - verify access rights
#[private]  
fn increment_safe(owner: AztecAddress) {
    assert(owner == context.msg_sender());
    // Now safe to proceed
}
```

## Key Takeaways

1. **Private contracts use note-based state** - not direct variable updates
2. **Privacy is achieved through encryption** - only note owners can decrypt
3. **Access control is cryptographically enforced** - through zero-knowledge proofs
4. **State updates replace notes** - old notes are nullified, new notes created
5. **Private functions execute client-side** - maintaining complete privacy
6. **Testing requires understanding the privacy model** - use simulate() for private reads

---

## Next Steps

Now that you've built your first private contract, let's explore the differences between private and public functions and when to use each.

**Continue to:** [Private vs Public Functions →](/aztec/learning_journey/phase_5/private_vs_public)

---

**Phase 5 Navigation:**  
[← Development Environment](/aztec/learning_journey/phase_5/development_environment) | **First Private Contract** | [Private vs Public Functions →](/aztec/learning_journey/phase_5/private_vs_public)