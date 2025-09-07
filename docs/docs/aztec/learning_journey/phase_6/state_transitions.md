---
title: "State Transitions"
description: "Managing complex workflows that involve both private and public state changes in sophisticated applications."
sidebar_position: 3
tags: [state-transitions, hybrid-workflows, private-to-public, complex-patterns]
---

# State Transitions: Private ↔ Public

## Managing Hybrid State Workflows

Real-world applications often need complex workflows that involve both private and public state changes. Understanding how to design these **state transitions** effectively is crucial for building sophisticated privacy-preserving applications.

## State Transition Patterns

### Pattern 1: Private → Public Flow

**Common Use Case:** Private actions that trigger public updates

```rust
#[private]
fn private_action() {
    // 1. Private computation/validation
    // 2. Private state changes  
    // 3. Enqueue public function call
}

#[public]
internal fn public_settlement() {
    // 4. Public state changes
    // 5. Public event emission
}
```

### Pattern 2: Public Setup → Private Processing

**Common Use Case:** Public announcements followed by private responses

```rust
#[public]
fn announce_public_event() {
    // 1. Public announcement
    // 2. Set public parameters
}

#[private]
fn private_response() {
    // 3. Read public parameters
    // 4. Private processing
    // 5. Private state changes
}
```

### Pattern 3: Multi-Phase Workflows

**Common Use Case:** Complex processes requiring multiple state transitions

```rust
// Phase 1: Public setup
// Phase 2: Private commitments  
// Phase 3: Public reveals
// Phase 4: Private settlements
```

## Comprehensive Example: Private Auction System

Let's build a **Private Auction** that demonstrates sophisticated state transitions:

```rust
#[aztec]
contract PrivateAuction {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]
    struct Storage {
        // PUBLIC STATE: Auction parameters visible to all
        auction_item: PublicMutable<Field>,
        auction_end_time: PublicMutable<Field>,
        min_bid: PublicMutable<Field>,
        auction_active: PublicMutable<Field>, // 0=inactive, 1=bidding, 2=ended
        total_bids: PublicMutable<Field>,
        
        // PRIVATE STATE: Individual bid details  
        user_bids: Map<AztecAddress, PrivateSet<ValueNote>>, // bidder -> bid amounts
        user_commitments: Map<AztecAddress, PrivateMutable<ValueNote>>, // bidder -> commitment
        
        // HYBRID STATE: Winning bid (public amount, private winner initially)
        winning_bid_amount: PublicMutable<Field>,
        winning_bidder: PublicMutable<AztecAddress>, // Revealed at end
    }

    // PHASE 1: PUBLIC SETUP
    #[public]
    fn start_auction(item: Field, duration: Field, minimum_bid: Field) {
        // Initialize auction parameters
        storage.auction_item.write(item);
        storage.auction_end_time.write(context.timestamp() + duration);
        storage.min_bid.write(minimum_bid);
        storage.auction_active.write(1); // Set to bidding phase
        storage.total_bids.write(0);
        storage.winning_bid_amount.write(0);
    }

    // PHASE 2: PRIVATE BIDDING
    #[private]
    fn place_bid(bidder: AztecAddress, amount: Field, bid_id: Field) {
        assert(bidder == context.msg_sender());
        
        // Read public auction state  
        let auction_status = storage.auction_active.read();
        let min_bid = storage.min_bid.read();
        let end_time = storage.auction_end_time.read();
        
        // Validate bid conditions
        assert(auction_status == 1); // Must be in bidding phase
        assert(context.timestamp() < end_time); // Must be before end time
        assert(amount >= min_bid); // Must meet minimum bid

        // Store private bid details
        storage.user_bids.at(bidder).insert(ValueNote::new(amount, bidder));
        
        // Create commitment to bid (for later reveal)
        let commitment = pedersen_hash([amount, bidder.to_field(), bid_id]);
        storage.user_commitments.at(bidder).replace(ValueNote::new(commitment, bidder));

        // Update public statistics (without revealing bid amount)
        PrivateAuction::at(context.this_address())._update_bid_stats().enqueue(&mut context);
    }

    #[public]
    internal fn _update_bid_stats() {
        let current_total = storage.total_bids.read();
        storage.total_bids.write(current_total + 1);
    }

    // PHASE 3: END AUCTION (TRANSITION TO REVEAL PHASE)
    #[public]
    fn end_auction() {
        let end_time = storage.auction_end_time.read();
        let auction_status = storage.auction_active.read();
        
        assert(context.timestamp() >= end_time); // Auction must have ended
        assert(auction_status == 1); // Must be in bidding phase
        
        // Transition to reveal phase
        storage.auction_active.write(2); // Set to ended/reveal phase
    }

    // PHASE 4: PRIVATE BID REVEALS
    #[private]
    fn reveal_bid(bidder: AztecAddress, amount: Field, bid_id: Field) {
        assert(bidder == context.msg_sender());
        
        // Verify auction is in reveal phase
        let auction_status = storage.auction_active.read();
        assert(auction_status == 2);

        // Verify bid commitment
        let stored_commitment = storage.user_commitments.at(bidder).get_note().value;
        let revealed_commitment = pedersen_hash([amount, bidder.to_field(), bid_id]);
        assert(stored_commitment == revealed_commitment);

        // Check if this is the winning bid and update if so
        let current_winning_amount = storage.winning_bid_amount.read();
        if amount > current_winning_amount {
            PrivateAuction::at(context.this_address())._update_winning_bid(bidder, amount).enqueue(&mut context);
        }
    }

    #[public] 
    internal fn _update_winning_bid(bidder: AztecAddress, amount: Field) {
        // Update winning bid (now public information)
        storage.winning_bid_amount.write(amount);
        storage.winning_bidder.write(bidder);
    }

    // PHASE 5: SETTLEMENT
    #[private]
    fn claim_item(winner: AztecAddress) {
        assert(winner == context.msg_sender());
        
        // Verify caller is the winner
        let winning_bidder = storage.winning_bidder.read();
        assert(winner == winning_bidder);

        // Private settlement logic (transfer item to winner)
        // This would involve cross-contract calls to item/payment contracts
        settle_auction_privately(winner);

        // Mark auction as completed
        PrivateAuction::at(context.this_address())._complete_auction().enqueue(&mut context);
    }

    #[public]
    internal fn _complete_auction() {
        storage.auction_active.write(3); // Set to completed
    }

    // UTILITY FUNCTIONS
    #[public]
    fn get_auction_info() -> (Field, Field, Field, Field, Field) {
        (
            storage.auction_item.read(),
            storage.auction_end_time.read(), 
            storage.min_bid.read(),
            storage.auction_active.read(),
            storage.total_bids.read()
        )
    }

    #[public]
    fn get_winning_bid() -> (AztecAddress, Field) {
        let auction_status = storage.auction_active.read();
        assert(auction_status >= 2); // Only show after auction ends
        
        (storage.winning_bidder.read(), storage.winning_bid_amount.read())
    }

    #[private]
    fn get_my_bids(bidder: AztecAddress) -> Field {
        assert(bidder == context.msg_sender());
        
        // Return total of user's bids
        storage.user_bids.at(bidder).get_notes(GetNotesOptions::new()).fold(0, |sum, note| sum + note.value)
    }

    fn settle_auction_privately(winner: AztecAddress) {
        // Implementation would handle private settlement
        // Could involve NFT transfer, payment processing, etc.
    }
}
```

## State Transition Analysis

### Phase Flow Breakdown

**Phase 1: Public Setup**
```
Public State Changes:
├── auction_item: Set to item ID
├── auction_end_time: Set to deadline  
├── min_bid: Set to minimum bid
├── auction_active: Set to 1 (bidding)
└── total_bids: Initialize to 0

Privacy Properties:
├── All auction parameters are public
├── Anyone can see auction details
└── No private information yet
```

**Phase 2: Private Bidding** 
```
Private State Changes:
├── user_bids: Each user's bid amounts (private)
├── user_commitments: Commitments for later reveal
└── Individual bid details hidden

Public State Changes:
├── total_bids: Incremented (count only, not amounts)
└── No bid details revealed publicly

Privacy Properties:
├── Bid amounts are private
├── Bidder identities are private  
├── Only bid count is public
└── Commitments enable later verification
```

**Phase 3: Auction End Transition**
```
Public State Changes:
├── auction_active: Changed from 1 to 2 (reveal phase)
└── Signals phase transition to all participants

Privacy Properties:
├── Still no private data revealed
├── Participants can see phase change
└── Sets up reveal phase
```

**Phase 4: Private Reveals**
```
Private Processing:
├── Each user reveals their bid privately
├── Commitments verified against reveals
└── Winning bid determined through comparison

Selective Public Updates:
├── winning_bid_amount: Highest bid amount revealed
├── winning_bidder: Winner identity revealed
└── Only winning information becomes public

Privacy Properties:
├── Non-winning bids stay private
├── Only winner information revealed
└── Other bidders maintain privacy
```

**Phase 5: Private Settlement**
```
Private Processing:
├── Winner claims item privately
├── Settlement happens off public view
└── Private cross-contract interactions

Public Finalization:
├── auction_active: Set to 3 (completed)
└── Auction marked as finished

Privacy Properties:
├── Settlement details remain private
├── Only completion status public
└── Payment/transfer details hidden
```

## Advanced State Transition Patterns

### Pattern A: Conditional State Transitions

```rust
#[private] 
fn conditional_transition(user: AztecAddress, condition_met: bool) {
    if condition_met {
        // Proceed to next state
        ContractName::at(context.this_address())._advance_state().enqueue(&mut context);
    } else {
        // Stay in current state or handle failure
        ContractName::at(context.this_address())._handle_failure().enqueue(&mut context);  
    }
}
```

### Pattern B: Multi-Party Coordination

```rust
#[private]
fn coordinate_multi_party_action(participants: [AztecAddress; 3], data: Field) {
    // Each participant processes privately
    for i in 0..3 {
        if participants[i] == context.msg_sender() {
            process_participant_action(data);
            
            // Signal readiness publicly
            ContractName::at(context.this_address())._signal_ready(participants[i]).enqueue(&mut context);
        }
    }
}

#[public]
internal fn _signal_ready(participant: AztecAddress) {
    let current_ready = storage.ready_participants.read();
    storage.ready_participants.write(current_ready + 1);
    
    // If all participants ready, trigger next phase
    if current_ready + 1 == 3 {
        storage.phase.write(2); // Move to next phase
    }
}
```

### Pattern C: Time-Based Transitions

```rust
#[public]
fn check_time_transitions() {
    let current_time = context.timestamp();
    let phase_end_time = storage.phase_end_time.read();
    
    if current_time >= phase_end_time {
        let current_phase = storage.current_phase.read();
        storage.current_phase.write(current_phase + 1);
        
        // Set next phase duration
        storage.phase_end_time.write(current_time + get_phase_duration(current_phase + 1));
    }
}
```

### Pattern D: Rollback Mechanisms

```rust
#[private]
fn attempt_risky_operation(user: AztecAddress, amount: Field) {
    // Try to execute operation
    let success = execute_complex_operation(amount);
    
    if success {
        // Commit the changes
        ContractName::at(context.this_address())._commit_operation(amount).enqueue(&mut context);
    } else {
        // Rollback private changes and signal failure
        rollback_private_changes();
        ContractName::at(context.this_address())._signal_failure(user).enqueue(&mut context);
    }
}
```

## Testing State Transition Systems

```typescript
describe('Private Auction State Transitions', () => {
  let auction: PrivateAuctionContract;
  let alice: Wallet, bob: Wallet, charlie: Wallet;

  beforeAll(async () => {
    auction = await PrivateAuctionContract.deploy(wallet).send().deployed();
    [alice, bob, charlie] = await getInitialTestAccountsWallets(pxe);
  });

  test('complete auction workflow', async () => {
    // Phase 1: Start auction
    await auction.methods.start_auction(
      123n, // item ID
      3600n, // 1 hour duration
      100n  // minimum bid
    ).send().wait();

    let [item, endTime, minBid, status, totalBids] = await auction.methods.get_auction_info().simulate();
    expect(status).toBe(1n); // Bidding phase

    // Phase 2: Private bidding
    await auction.methods.place_bid(alice.address, 150n, 1n).send({ from: alice }).wait();
    await auction.methods.place_bid(bob.address, 200n, 2n).send({ from: bob }).wait();
    await auction.methods.place_bid(charlie.address, 180n, 3n).send({ from: charlie }).wait();

    // Check only bid count is public
    [, , , status, totalBids] = await auction.methods.get_auction_info().simulate();
    expect(totalBids).toBe(3n);
    expect(status).toBe(1n); // Still bidding

    // Phase 3: End auction (simulate time passing)
    // In real test, would need to advance time
    await auction.methods.end_auction().send().wait();
    
    [, , , status,] = await auction.methods.get_auction_info().simulate();
    expect(status).toBe(2n); // Reveal phase

    // Phase 4: Reveal bids
    await auction.methods.reveal_bid(alice.address, 150n, 1n).send({ from: alice }).wait();
    await auction.methods.reveal_bid(bob.address, 200n, 2n).send({ from: bob }).wait(); 
    await auction.methods.reveal_bid(charlie.address, 180n, 3n).send({ from: charlie }).wait();

    // Check winning bid is now public
    const [winner, winAmount] = await auction.methods.get_winning_bid().simulate();
    expect(winner).toBe(bob.address);
    expect(winAmount).toBe(200n);

    // Phase 5: Settlement
    await auction.methods.claim_item(bob.address).send({ from: bob }).wait();
    
    [, , , status,] = await auction.methods.get_auction_info().simulate();
    expect(status).toBe(3n); // Completed
  });

  test('privacy properties maintained', async () => {
    // Alice can see her own bids
    const aliceBids = await auction.methods.get_my_bids(alice.address).simulate({ from: alice });
    expect(aliceBids).toBe(150n);

    // Bob cannot see Alice's bids
    await expect(
      auction.methods.get_my_bids(alice.address).simulate({ from: bob })
    ).rejects.toThrow();

    // Non-winning bids remain private (only total count and winner visible)
    const [winner, amount] = await auction.methods.get_winning_bid().simulate();
    expect(winner).toBe(bob.address);
    expect(amount).toBe(200n);
    // Alice's 150n and Charlie's 180n bids are not publicly visible
  });
});
```

## State Transition Best Practices

### 1. Clear Phase Definitions
```rust
// ✅ Good - explicit phase constants
const PHASE_SETUP: Field = 0;
const PHASE_BIDDING: Field = 1;
const PHASE_REVEAL: Field = 2;
const PHASE_COMPLETE: Field = 3;

// ❌ Avoid - magic numbers
if storage.phase.read() == 2 { /* unclear what phase 2 means */ }
```

### 2. State Validation
```rust
// ✅ Good - validate state before operations
#[private]
fn state_dependent_operation() {
    let current_phase = storage.phase.read();
    assert(current_phase == PHASE_BIDDING);
    // Now safe to proceed
}
```

### 3. Atomic State Transitions
```rust
// ✅ Good - atomic transition with validation
#[public]
internal fn _transition_to_next_phase() {
    let current = storage.phase.read();
    assert(current < PHASE_COMPLETE);
    storage.phase.write(current + 1);
    storage.phase_start_time.write(context.timestamp());
}
```

### 4. Event Emission for Coordination
```rust
// ✅ Good - emit events for state changes
#[public]
internal fn _phase_transition(new_phase: Field) {
    storage.phase.write(new_phase);
    emit PhaseChanged(new_phase, context.timestamp());
}
```

## Common State Transition Mistakes

### Mistake 1: Inconsistent State Updates
```rust
// ❌ Wrong - partial state update
#[public]
fn bad_transition() {
    storage.phase.write(2);
    // Forgot to update related state variables
}

// ✅ Correct - complete state update
#[public] 
fn good_transition() {
    storage.phase.write(2);
    storage.phase_start_time.write(context.timestamp());
    storage.phase_participants.write(0);
}
```

### Mistake 2: Missing State Validation
```rust
// ❌ Wrong - no validation
#[private]
fn risky_operation() {
    // Anyone can call this in any phase
    do_sensitive_operation();
}

// ✅ Correct - proper validation
#[private] 
fn safe_operation() {
    let phase = storage.phase.read();
    assert(phase == REQUIRED_PHASE);
    assert(context.msg_sender() == authorized_user());
    do_sensitive_operation();
}
```

### Mistake 3: Race Conditions in Transitions
```rust
// ❌ Wrong - race condition possible
#[public]
fn racy_transition() {
    if storage.ready_count.read() == TARGET_COUNT {
        storage.phase.write(NEXT_PHASE); // What if two calls happen simultaneously?
    }
}

// ✅ Correct - atomic check and update
#[public]
fn safe_transition() {
    let current_count = storage.ready_count.read();
    storage.ready_count.write(current_count + 1);
    
    if current_count + 1 == TARGET_COUNT {
        storage.phase.write(NEXT_PHASE);
    }
}
```

## Key Takeaways

1. **State transitions enable complex workflows** - combining private and public operations effectively
2. **Clear phase definitions prevent confusion** - use constants and explicit state management
3. **Validation is crucial at each phase** - verify conditions before state-dependent operations
4. **Privacy properties can change between phases** - design reveals and settlements carefully
5. **Testing requires workflow simulation** - test complete state transition sequences
6. **Atomic operations prevent race conditions** - ensure consistent state updates

---

## Next Steps

Now that you understand complex state transitions, let's explore common privacy pitfalls and how to avoid them in your applications.

**Continue to:** [Privacy Pitfalls and Solutions →](/aztec/learning_journey/phase_6/privacy_pitfalls)

---

**Phase 6 Navigation:**  
[← Cross-Contract Communication](/aztec/learning_journey/phase_6/cross_contract) | **State Transitions** | [Privacy Pitfalls →](/aztec/learning_journey/phase_6/privacy_pitfalls)