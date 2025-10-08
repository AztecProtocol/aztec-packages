---
title: "Keep Building: Expand Your Contract"
tags: [contracts, learning journey, practice, exercises]
description: "Enhance the contract you started earlier by adding custom notes, composability, and events with guided exercises"
---

Great work completing the sections on custom notes, composability, and events! You've now learned some of Aztec's most powerful features for building sophisticated privacy-preserving applications. Let's put these concepts into practice.

## Learning Objectives

Time to level up! This exercise will help you apply advanced Aztec features. By the end, you should be able to:

- ✅ Design and implement custom note types for your specific use case
- ✅ Call functions in other contracts using generated interfaces
- ✅ Emit both encrypted (private) and unencrypted (public) events
- ✅ Build contracts that compose with existing protocols
- ✅ Structure complex private data with meaningful note fields

Each feature you master makes your contracts more powerful and production-ready. Let's do this!

## Time to Level Up Your Contract

Remember the contract you started building after learning about storage, functions, and compilation? Now's the perfect time to expand it with the advanced features you've just learned. These concepts will transform your basic contract into something much more powerful and production-ready.

If you haven't started building yet, check out [Start Building: Practice Your Skills](../storage_functions_compile_test/exercise) first, then come back here.

## What to Add Next

Here are the new capabilities you can now incorporate into your contract:

### Custom Notes

Refine your private data structures with custom note types:

- Design notes that perfectly match your use case
- Add custom fields beyond simple values
- Implement specialized behavior for your notes
- Control exactly what private data gets stored and how

If you started with simple `ValueNote` storage, consider replacing it with a custom note that captures more context about your application's domain.

### Contract Composability

Make your contract interact with others:

- Call functions in other contracts (both private and public)
- Build modular systems where contracts work together
- Create contracts that act as interfaces to existing protocols
- Use the auto-generated contract interfaces for type-safe calls

Think about what external contracts your application might need - a token contract for payments? A registry for lookups? An oracle for data?

### Events

Add visibility and tracking to your contract:

- Emit events when important state changes occur
- Allow applications to monitor and react to contract activity
- Create both encrypted (private) and unencrypted (public) events
- Help users and interfaces track what's happening

Consider what events would be useful for someone building a frontend for your contract. What actions should they be notified about?

## Ideas for Expansion

Depending on what you built initially, here are some ways to incorporate these new concepts:

### If You Built a Task Manager:

- **Custom Notes**: Create detailed task notes with metadata like priority, tags, and timestamps
- **Composability**: Integrate with a token contract to add task rewards or bounties
- **Events**: Emit events when tasks are created, completed, or assigned

### If You Built a Token:

- **Custom Notes**: Add transfer notes with memo fields or expiration dates
- **Composability**: Build a DEX interface that calls your token's transfer functions
- **Events**: Emit transfer events (encrypted or public based on privacy needs)

### If You Built a Voting System:

- **Custom Notes**: Store votes with additional context like comments or weights
- **Composability**: Connect to a token contract to check voting power
- **Events**: Emit events when proposals are created and when voting ends

### If You Built an Escrow:

- **Custom Notes**: Create detailed escrow agreements with terms and conditions
- **Composability**: Call token contracts to hold and release funds
- **Events**: Emit events for escrow creation, funding, and release

### If You Built a Secret Society:

- **Custom Notes**: Create membership notes with additional metadata like join date, roles, or reputation
- **Composability**: Integrate with a token contract for membership fees or voting power
- **Events**: Emit encrypted events when members are added (visible only to members)

## Getting Started with Enhancements

Here's a suggested approach to adding these features:

1. **Start with Events**: Add event emissions to your existing functions. This is straightforward and immediately useful for testing and monitoring.

2. **Upgrade to Custom Notes**: If you used simple notes, refactor them into custom note types that better represent your domain.

3. **Add Composability**: Identify one external interaction that would add value (like calling a token contract) and implement it.

## Key Concepts to Apply

As you build, keep these principles in mind:

**Custom Notes Are Powerful**: Don't settle for generic note types. Design notes that perfectly match your needs - this makes your contract clearer and more maintainable.

**Composability Enables Innovation**: The ability to call other contracts means you don't have to build everything yourself. Leverage existing infrastructure and focus on your unique value.

**Events Create Transparency**: Even in private systems, selective transparency through events is valuable. Choose what to reveal carefully, but do provide ways for users and applications to track important changes.

## Hands-On Exercises

Let's practice these advanced features with progressive exercises. Don't skip ahead - each builds on the previous!

### Exercise: Create a Custom Task Note

**Goal**: Replace generic `ValueNote` with a rich custom note type.

**Starting Point**: If you built the Task Manager from the previous exercise, enhance it. Otherwise, create a new contract with this custom note.

**Requirements**:
- Create a `TaskNote` with fields: `task_id`, `description_hash`, `priority`, `created_at`, `owner`
- Use your custom note in storage instead of `ValueNote`
- Implement serialization and deserialization methods

**Solution Hints**:
<details>
<summary>Click to see custom note structure</summary>

```rust
use dep::aztec::prelude::{AztecAddress, NoteInterface, NoteHeader, PrivateContext};

struct TaskNote {
    task_id: Field,
    description_hash: Field,  // Hash of task description for privacy
    priority: Field,          // 1 = low, 2 = medium, 3 = high
    created_at: Field,        // Timestamp
    owner: AztecAddress,
    header: NoteHeader,
}

impl TaskNote {
    fn new(task_id: Field, description_hash: Field, priority: Field, owner: AztecAddress) -> Self {
        TaskNote {
            task_id,
            description_hash,
            priority,
            created_at: context.timestamp(), // Get block timestamp
            owner,
            header: NoteHeader::empty(),
        }
    }
}

impl NoteInterface<TASK_NOTE_LEN> for TaskNote {
    // Implement required methods: serialize, deserialize, compute_note_hiding_point
    // See Aztec.nr examples for full implementation
}
```

</details>

**Checkpoint**: Can you create a task, retrieve it, and access all custom fields?

---

### Exercise: Emit Custom Events

**Goal**: Add meaningful events that help track contract activity.

**Requirements**:
- Define custom event structures
- Emit an encrypted event when creating private tasks (visible only to task owner)
- Emit a public event when milestones are reached (e.g., 100th task created)
- Include relevant data in each event

**Solution Hints**:
<details>
<summary>Click to see event definition pattern</summary>

```rust
// TODO: Add imports necessary for events
// Define your events
#[event]
struct TaskCreated {
    task_id: Field,
    owner: AztecAddress,
    priority: Field,
}

#[event]
struct MilestoneReached {
    milestone: Field,
    total_tasks: u64,
}

// In your contract function:
#[private]
fn create_task(...) {
    // ... task creation logic ...

    // Emit encrypted event (only owner can decrypt)
    dep::aztec::event_emission::emit_event_in_private(
        TaskCreated { task_id, owner, priority },
        &mut context,
        context.msg_sender(),
        MessageDelivery::CONSTRAINED_ONCHAIN
    );

    // Enqueue public function that might emit public milestone
    ...
}
```

</details>

---

### Exercise: Combine Everything

**Goal**: Build a complete feature using all three advanced concepts.

**Scenario**: Create a "Task Bounty" system where:
- Tasks have detailed custom notes (TaskBountyNote with amount, deadline, requirements)
- Creating a bounty charges the creator via token transfer (composability)
- Completing a task pays the bounty to the worker (more composability)
- Events track bounty creation, claims, and completions

**Requirements**:
- Custom `TaskBountyNote` with relevant fields
- Token integration for payments
- Encrypted events for private actions
- Public events for bounty milestones

**Hints**: This is a mini-project! Start by designing the flow on paper:
1. What functions do you need?
2. Which should be private vs public?
3. What events make sense at each step?
4. How do the contracts interact?

Don't expect to get this perfect on the first try - iteration is how you learn!

## Next Steps

Once you've enhanced your contract with these features:

- **Test thoroughly**: Make sure your new functionality works as expected
- **Experiment with combinations**: See how these features work together
- **Consider edge cases**: What happens in error scenarios?
- **Think about security**: Are there any new attack vectors to consider?

Building real contracts with real features is how you'll truly internalize these powerful concepts. Each addition makes your contract more capable and your understanding deeper.

## Additional Resources

- [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate) - Reference implementation
- [Aztec.nr Reference](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr) - Library documentation
- [Example Contracts](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts) - Real-world examples

---

**Keep building!** Each feature you add brings your contract closer to being production-ready. Don't worry about getting everything perfect - iteration and experimentation are key to mastering these concepts.
