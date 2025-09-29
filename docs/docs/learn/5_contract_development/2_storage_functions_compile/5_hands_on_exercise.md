---
title: "Hands-On Exercise: Build Your First Contract"
tags: [contracts, learning journey, exercise, tutorial]
description: "Put your knowledge into practice by creating and compiling a custom Aztec smart contract using the Aztec boilerplate."
---

Congratulations on making it through storage, functions, and compilation! You've absorbed a lot of information, and now it's time for the best part: **putting it all into practice**. There's no better way to solidify your understanding than by actually building something yourself.

In this hands-on exercise, you'll use the [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate) - a starter template that comes with everything you need to develop Aztec contracts. The boilerplate includes a sample Counter contract, but you're going to create your own contract from scratch, applying everything you've learned about storage, functions, and compilation.

## What You'll Build

You'll create a **Task Manager** contract that demonstrates:

- Private and public storage
- Multiple function types (`#[private]`, `#[public]`, `#[utility]`, `#[initializer]`)
- Working with custom note types
- Contract compilation

This exercise should take 30-45 minutes if you're comfortable with the concepts, or longer if you want to experiment and explore.

## Prerequisites

Before starting, make sure you have:

- Completed the previous sections on Contract Structure, Storage, Functions, and Compilation
- Basic familiarity with Noir syntax
- Access to a development environment with Git and Docker

## Exercise: Build a Task Manager Contract

### Step 1: Set Up the Boilerplate

Clone and set up the Aztec boilerplate:

```bash
git clone https://github.com/defi-wonderland/aztec-boilerplate.git my-task-manager
cd my-task-manager
```

Follow the setup instructions in the boilerplate's README to:

1. Install dependencies
2. Start the Aztec sandbox (if running locally)
3. Familiarize yourself with the project structure

### Step 2: Examine the Existing Contract

Before creating your own contract, take a look at the existing Counter contract in `src/nr/`. Notice:

- How storage is declared with the `#[storage]` attribute
- The different function types used (`#[private]`, `#[public]`, etc.)
- The project structure in `Nargo.toml`

This will give you a sense of the conventions and patterns used in Aztec contracts.

### Step 3: Create Your Task Manager Contract

Create a new contract project folder `src/nr/task_manager/` with the following requirements:

#### Storage Requirements

Your contract should have:

1. **Private storage**:

   - A `PrivateSet` to store tasks for each user (use a `Map` keyed by `AztecAddress`)
   - Each task should be a custom note type with:
     - Task ID (`Field`)
     - Task description hash (`Field`)
     - Completion status (`bool`)
     - Owner (`AztecAddress`)
     - Randomness (`Field`)

2. **Public storage**:
   - A counter tracking the total number of tasks created across all users
   - The contract admin address

#### Function Requirements

Implement these functions:

1. **`constructor`** (`#[initializer]`, `#[private]`):

   - Initialize the admin address
   - Set the initial task counter to 0

2. **`add_task`** (`#[private]`):

   - Accept a task description hash
   - Create a new task note for the caller
   - Increment the public counter (enqueue a call to a public function)

3. **`complete_task`** (`#[private]`):

   - Accept a task ID
   - Mark the specified task as complete
   - Verify the caller owns the task

4. **`increment_task_counter_internal`** (`#[public]`, `#[internal]`):

   - Increment the total task counter
   - Only callable by the contract itself (from `add_task`)

5. **`get_total_tasks`** (`#[public]`, `#[view]`):

   - Return the total number of tasks created

6. **`get_my_tasks`** (`#[utility]`):
   - Accept an owner address
   - Return the task notes for that owner
   - This queries the PXE database

### Step 4: Define Your Custom Note Type

Before implementing your storage, define a custom note type for tasks:

```rust
#[note]
struct TaskNote {
    task_id: Field,
    description_hash: Field,
    completed: bool,
    owner: AztecAddress,
    randomness: Field,
}
```

The `#[note]` attribute will auto-generate the necessary serialization and hashing functions.

### Step 5: Compile Your Contract

Once you've written your contract:

1. Compile it using `aztec-nargo compile`
2. Post-process it using `aztec-postprocess-contract`
3. Check that artifacts are generated in the `target` directory

If compilation fails, carefully read the error messages - they'll guide you to what needs fixing.

### Step 6: Update Your Project Configuration

Make sure your root `Nargo.toml` includes your new contract.

## Verification Checklist

Use this checklist to verify you've completed the exercise correctly:

- [ ] Contract compiles without errors
- [ ] Storage struct includes both private and public state
- [ ] Custom `TaskNote` type is properly defined with `#[note]`
- [ ] Constructor initializes admin and counter
- [ ] `add_task` creates a task and enqueues a public call
- [ ] `complete_task` modifies a task note
- [ ] Public counter increments through an internal function
- [ ] View function returns the task count
- [ ] Utility function queries tasks from PXE
- [ ] Artifacts are generated in the `target` directory

## Common Challenges and Hints

### Challenge 1: "How do I store multiple tasks per user?"

**Hint**: Use a `Map<AztecAddress, PrivateSet<TaskNote, Context>, Context>` in your storage. The map key is the user's address, and the value is a set of their task notes.

### Challenge 2: "How do I enqueue a public function call from a private function?"

**Hint**: Use the auto-generated interface:

```rust
TaskManager::at(context.this_address())
    .increment_task_counter_internal()
    .enqueue(&mut context);
```

### Challenge 3: "My task notes aren't being created properly"

**Hint**: Make sure you're:

1. Creating the note with all required fields
2. Calling `.insert()` on your `PrivateSet`
3. Providing a unique task ID (you can use a counter or hash)

### Challenge 4: "Compilation fails with context errors"

**Hint**: Check that your storage is properly typed with `Storage<Context>` and that you're passing context correctly to storage operations.

## Extend Your Learning

Once you've completed the basic exercise, try these extensions:

### Extension 1: Add Task Priorities

Modify `TaskNote` to include a priority field (0-3) and implement a function to query high-priority tasks only.

### Extension 2: Add Task Deadlines

Add a timestamp field and implement a function to check for overdue tasks.

### Extension 3: Share Tasks

Implement a function that allows a user to assign a task to another user (hint: you'll need to handle authorization).

### Extension 4: Task Categories

Add public state to track task counts by category, demonstrating how to maintain aggregate statistics.

## Reflection Questions

After completing the exercise, reflect on these questions:

1. **Privacy Trade-offs**: Why did we make tasks private but the counter public? What would change if we made tasks public?

2. **Function Types**: Why is `increment_task_counter_internal` marked as `#[internal]`? What would happen if we removed that attribute?

3. **Note Design**: Why does `TaskNote` include a `randomness` field? What role does it play in privacy?

4. **Compilation Artifacts**: Look at the generated artifacts in the `target` directory. What files were created, and what do you think each one is for?

## What You've Accomplished

By completing this exercise, you've:

- ✅ Created a complete Aztec smart contract from scratch
- ✅ Implemented both private and public storage
- ✅ Used multiple function types appropriately
- ✅ Defined a custom note type for private data
- ✅ Successfully compiled an Aztec contract
- ✅ Understood the relationship between private and public execution

This is a significant milestone! You've moved from reading about concepts to actually implementing them. The contract you just built demonstrates the core patterns you'll use in real Aztec applications.

## Next Steps

Now that you can create and compile contracts, you're ready to learn about:

- **Contract Composability** - How contracts call other contracts
- **Events** - How to emit and listen for contract events
- **Authorization Witnesses** - Advanced access control patterns
- **Testing** - How to write comprehensive tests for your contracts

Take a moment to celebrate what you've learned - you're well on your way to becoming an Aztec developer!

## Additional Resources

- [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate) - The starter template
- [Aztec.nr Reference](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr) - Library documentation
- [Noir Language Documentation](https://noir-lang.org/docs) - Noir language guide

---

**Troubleshooting**: If you get stuck, don't worry! Smart contract development involves a learning curve. Try:

1. Re-reading the relevant section (Storage, Functions, or Compilation)
2. Looking at the Counter contract example in the boilerplate
3. Checking your error messages carefully - they're usually informative
4. Experimenting with simpler versions first, then adding complexity

Remember: every expert was once a beginner who refused to give up. Keep building!
