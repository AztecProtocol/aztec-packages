---
title: "Private vs Public Functions"
description: "Understanding execution contexts and designing hybrid public/private functionality in Aztec.nr contracts."
sidebar_position: 3
tags: [private-functions, public-functions, hybrid-execution, execution-contexts]
---

# Private vs Public Functions

## Choosing Your Execution Context

One of Aztec's most powerful features is **hybrid execution** - the same contract can have functions that run in different contexts. Understanding when and how to use private vs public functions is crucial for building effective privacy-preserving applications.

## Execution Context Comparison

### Private Functions: Your Personal Computer
```rust
#[private]
fn my_private_function() {
    // Runs on YOUR device (PXE)
    // Uses YOUR private data
    // Generates proofs of correct execution
    // Network verifies proofs, not execution details
}
```

### Public Functions: The Network Computer
```rust
#[public]
fn my_public_function() {
    // Runs on network nodes (AVM)
    // Uses public data from network
    // Execution is transparent and verifiable
    // Everyone can see the computation
}
```

## Extended Counter Example

Let's enhance our counter contract to demonstrate hybrid execution:

```rust
#[aztec]
contract HybridCounter {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]
    struct Storage {
        // Private storage: individual user counters
        private_counters: Map<AztecAddress, PrivateMutable<ValueNote>>,
        
        // Public storage: global statistics
        total_increments: PublicMutable<Field>,
        active_users: PublicMutable<Field>,
        contract_owner: PublicImmutable<AztecAddress>,
    }

    #[public]
    fn constructor(owner: AztecAddress) {
        storage.contract_owner.initialize(owner);
        storage.total_increments.write(0);
        storage.active_users.write(0);
    }

    // PRIVATE FUNCTIONS
    
    #[private]
    fn increment_private(owner: AztecAddress) {
        // Verify ownership
        assert(owner == context.msg_sender());
        
        // Check if this is user's first increment
        let is_new_user = !storage.private_counters.at(owner).is_initialized();
        
        // Get current value (0 if new user)
        let current_value = if is_new_user { 0 } else {
            storage.private_counters.at(owner).get_note(true).value
        };
        
        // Increment private counter
        let new_value = current_value + 1;
        storage.private_counters.at(owner).replace(ValueNote::new(new_value, owner));
        
        // Update public statistics (enqueue public function call)
        if is_new_user {
            Self::at(context.this_address()).update_stats_new_user().enqueue(&mut context);
        } else {
            Self::at(context.this_address()).update_stats_increment().enqueue(&mut context);
        }
    }

    #[private]
    fn get_private_counter(owner: AztecAddress) -> Field {
        assert(owner == context.msg_sender());
        
        if storage.private_counters.at(owner).is_initialized() {
            storage.private_counters.at(owner).get_note(true).value
        } else {
            0
        }
    }

    // PUBLIC FUNCTIONS
    
    #[public]
    internal fn update_stats_new_user() {
        // This runs publicly after private execution
        let current_total = storage.total_increments.read();
        let current_users = storage.active_users.read();
        
        storage.total_increments.write(current_total + 1);
        storage.active_users.write(current_users + 1);
    }

    #[public]
    internal fn update_stats_increment() {
        let current_total = storage.total_increments.read();
        storage.total_increments.write(current_total + 1);
    }

    #[public]
    fn get_total_increments() -> Field {
        storage.total_increments.read()
    }

    #[public]
    fn get_active_users() -> Field {
        storage.active_users.read()
    }

    #[public]
    fn reset_stats() {
        // Only contract owner can reset
        let owner = storage.contract_owner.read();
        assert(context.msg_sender() == owner);
        
        storage.total_increments.write(0);
        storage.active_users.write(0);
    }
}
```

## Understanding the Hybrid Flow

### What Happens When Alice Calls `increment_private()`

#### Phase 1: Private Execution (Alice's Device)
```
Alice's PXE:
├── Verifies Alice owns the counter
├── Reads Alice's current private counter value (e.g., 5)
├── Increments to new value (6)
├── Creates new encrypted note for Alice
├── Nullifies old note
├── Enqueues public function call: update_stats_increment()
└── Generates zero-knowledge proof of all operations
```

**Privacy Maintained:**
- Alice's counter value (5→6) never leaves her device
- The increment operation is hidden from observers
- Only proof of valid execution is shared

#### Phase 2: Public Execution (Aztec Network)
```
Aztec Network:
├── Receives Alice's proof and validates it
├── Processes enqueued public function: update_stats_increment()
├── Updates public total_increments counter
├── Makes global statistics visible to everyone
└── Commits both private and public state changes
```

**Public Information:**
- Total increments increased by 1
- A valid transaction was processed
- Global statistics are updated

### Observer Perspectives

**Alice Knows:**
- Her private counter went from 5 to 6
- She contributed to the global increment count
- Her transaction was successful

**Bob Knows (Another User):**
- Total increments increased from 1000 to 1001
- Someone incremented their private counter
- A valid transaction occurred

**Bob Doesn't Know:**
- Who incremented their counter
- What their new counter value is
- How many times that person has incremented before

## Function Design Patterns

### Pattern 1: Private Preparation + Public Execution

**Use Case:** Private voting with public tallies

```rust
#[private]
fn cast_vote(voter: AztecAddress, choice: Field) {
    // Verify voter eligibility privately
    assert_eligible_voter(voter);
    
    // Record private vote
    storage.votes.at(voter).replace(VoteNote::new(choice, voter));
    
    // Update public tally (enqueue)
    Self::at(context.this_address()).update_vote_tally(choice).enqueue(&mut context);
}

#[public]
internal fn update_vote_tally(choice: Field) {
    // Publicly update vote counts
    let current_votes = storage.vote_counts.at(choice).read();
    storage.vote_counts.at(choice).write(current_votes + 1);
}
```

**Benefits:**
- Vote choice remains private
- Voter identity remains private
- Vote tallies are publicly verifiable
- No double voting (enforced by nullifiers)

### Pattern 2: Public Setup + Private Processing

**Use Case:** Public auction with private bids

```rust
#[public]
fn start_auction(item: Field, duration: Field) {
    // Publicly announce auction
    storage.auction_item.write(item);
    storage.auction_end.write(context.timestamp() + duration);
    storage.auction_active.write(true);
}

#[private]
fn place_bid(bidder: AztecAddress, amount: Field) {
    // Check auction is active (read public state)
    let is_active = storage.auction_active.read();
    assert(is_active);
    
    // Place private bid
    storage.bids.at(bidder).replace(BidNote::new(amount, bidder));
    
    // Publicly signal that a bid was placed (without revealing amount)
    Self::at(context.this_address()).register_bid().enqueue(&mut context);
}

#[public]
internal fn register_bid() {
    let current_bid_count = storage.bid_count.read();
    storage.bid_count.write(current_bid_count + 1);
}
```

### Pattern 3: Pure Private Functions

**Use Case:** Personal financial management

```rust
#[private]
fn add_expense(user: AztecAddress, category: Field, amount: Field) {
    assert(user == context.msg_sender());
    
    // Purely private - no public component needed
    let expense = ExpenseNote::new(category, amount, user);
    storage.expenses.at(user).insert(expense);
}

#[private]
fn get_expenses_by_category(user: AztecAddress, category: Field) -> Field {
    assert(user == context.msg_sender());
    
    // Private calculation - sum expenses in category
    // Implementation would iterate through user's expense notes
    calculate_category_total(user, category)
}
```

### Pattern 4: Pure Public Functions

**Use Case:** Transparent governance or protocol parameters

```rust
#[public]
fn update_protocol_fee(new_fee: Field) {
    // Verify governance permissions
    assert(context.msg_sender() == storage.governance.read());
    
    // Transparently update protocol parameter
    storage.protocol_fee.write(new_fee);
}

#[public]
fn get_protocol_info() -> (Field, Field, Field) {
    (
        storage.protocol_fee.read(),
        storage.total_users.read(),
        storage.total_transactions.read()
    )
}
```

## Capability Comparison

### Private Functions Can:
- ✅ Read and write private state (notes)
- ✅ Read historical public state (not current)
- ✅ Enqueue public function calls
- ✅ Generate zero-knowledge proofs
- ✅ Maintain complete privacy

### Private Functions Cannot:
- ❌ Read current public state
- ❌ Call public functions directly
- ❌ Access network-wide information
- ❌ Perform transparent operations

### Public Functions Can:
- ✅ Read and write public state
- ✅ Call other public functions
- ✅ Access current network information
- ✅ Perform transparent computations
- ✅ Be called by external contracts

### Public Functions Cannot:
- ❌ Access private state directly
- ❌ Call private functions
- ❌ Generate zero-knowledge proofs
- ❌ Maintain privacy

## Design Decision Framework

### Choose Private Functions When:

**Privacy is Essential:**
- Personal financial data
- Private voting or surveys
- Confidential business logic
- Personal identity verification

**User Control is Important:**
- User-specific configurations
- Personal access control
- Individual state management
- Private authorizations

**Example:**
```rust
#[private]
fn update_personal_settings(user: AztecAddress, settings: Field) {
    assert(user == context.msg_sender());
    // User's personal settings should remain private
}
```

### Choose Public Functions When:

**Transparency is Required:**
- Governance mechanisms
- Public record keeping
- Protocol parameters
- Shared state coordination

**Network Coordination is Needed:**
- Multi-user interactions
- Public marketplaces
- Shared resource management
- Cross-contract calls

**Example:**
```rust
#[public]
fn execute_governance_proposal(proposal_id: Field) {
    // Governance execution should be transparent
    let proposal = storage.proposals.at(proposal_id).read();
    execute_proposal(proposal);
}
```

### Use Hybrid Patterns When:

**Privacy + Transparency Needed:**
- Private inputs with public outputs
- Selective disclosure scenarios
- Privacy-preserving analytics
- Compliance with auditability

**Example:** Private donations with public totals, private votes with public tallies

## Testing Hybrid Contracts

```typescript
describe('HybridCounter', () => {
  test('private increment updates public stats', async () => {
    // Initial public state
    let totalBefore = await contract.methods.get_total_increments().simulate();
    
    // Private increment
    await contract.methods.increment_private(alice.address).send().wait();
    
    // Check private state (only Alice can see)
    const aliceCount = await contract.methods
      .get_private_counter(alice.address)
      .simulate({ from: alice });
    
    // Check public state (everyone can see)
    const totalAfter = await contract.methods.get_total_increments().simulate();
    
    expect(aliceCount).toBe(1n);
    expect(totalAfter).toBe(totalBefore + 1n);
  });

  test('public stats are visible to everyone', async () => {
    // Bob can see public statistics
    const total = await contract.methods.get_total_increments().simulate();
    const users = await contract.methods.get_active_users().simulate();
    
    expect(total).toBeGreaterThan(0n);
    expect(users).toBeGreaterThan(0n);
  });

  test('Bob cannot see Alice private counter', async () => {
    // Bob trying to read Alice's private counter should fail
    await expect(
      contract.methods.get_private_counter(alice.address).simulate({ from: bob })
    ).rejects.toThrow();
  });
});
```

## Key Takeaways

1. **Hybrid execution enables flexible privacy** - choose the right context for each operation
2. **Private → Public flow is unidirectional** - private functions can enqueue public calls, not vice versa
3. **Each context has distinct capabilities** - understand what each can and cannot do
4. **Design patterns combine contexts effectively** - leverage the strengths of both
5. **Testing requires understanding both contexts** - verify privacy and transparency properties
6. **User experience benefits from hybrid patterns** - privacy where needed, transparency where helpful

---

## Next Steps

Now that you understand private vs public execution, let's explore the different storage types and note management patterns available in Aztec.nr.

**Continue to:** [Storage Types and Note Management →](/aztec/learning_journey/phase_5/storage_and_notes)

---

**Phase 5 Navigation:**  
[← First Private Contract](/aztec/learning_journey/phase_5/first_private_contract) | **Private vs Public Functions** | [Storage and Notes →](/aztec/learning_journey/phase_5/storage_and_notes)