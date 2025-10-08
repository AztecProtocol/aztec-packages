---
title: "Start Building: Practice Your Skills"
tags: [contracts, learning journey, practice, exercises]
description: "Apply what you've learned about storage, functions, and compilation by building your own Aztec smart contract with hands-on exercises"
sidebar_position: 5
---

Congratulations on completing the sections on storage, functions, and compilation! You now have the foundational knowledge needed to start building Aztec smart contracts. The best way to solidify your understanding is to **start building something yourself**.

## Learning Objectives

Time to practice! This exercise will help cement what you've learned. By the end of this section, you should be able to:

- ✅ Define storage with both private and public state variables
- ✅ Implement different function types (`#[private]`, `#[public]`, `#[utility]`, `#[initializer]`)
- ✅ Compile contracts using `aztec-nargo` and post-process artifacts
- ✅ Structure a complete Aztec contract following best practices
- ✅ Test your contract in the Aztec sandbox environment

Don't worry if this feels challenging - that's exactly how learning works! Each attempt makes you stronger.

## Ready to Build?

Now that you understand the core concepts, we recommend you start building a contract that incorporates what you've learned. The [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate) is an excellent starting point - it provides a complete development environment with:

- A sample Counter contract to learn from
- Pre-configured tooling and dependencies
- Project structure following Aztec conventions
- Ready-to-use testing setup

## What to Practice

As you build your own contract, try to incorporate these concepts you've learned:

### Storage

- Define both private and public state
- Use different storage types (`PrivateSet`, `PublicMutable`, `Map`, etc.)
- Consider creating custom note types for your private data

### Functions

- Implement different function types:
  - `#[private]` for confidential operations
  - `#[public]` for transparent state changes
  - `#[utility]` for offchain queries
  - `#[initializer]` for contract setup
- Practice enqueuing public functions from private contexts
- Use `#[internal]` for functions that should only be called by the contract itself

### Compilation

- Compile your contract with `aztec-nargo compile`
- Post-process artifacts with `aztec-postprocess-contract`
- Understand the generated artifacts in the `target` directory

## Project Ideas

Not sure what to build? Here are some ideas that will let you practice the concepts:

- **Task Manager**: Private tasks with public counters
- **Token**: Private balances with public supply tracking
- **Voting System**: Private votes with public tallies
- **Escrow Contract**: Private agreements with public settlement
- **Secret Society**: Private membership system with role-based access control (admin and moderators can privately add members)
- **Registry**: Map addresses to private or public data

Pick something that interests you and start simple. You can always add complexity as you gain confidence.

## Exercise: Simple Task Manager

**Goal**: Build a contract that manages private tasks with public counters.

**Requirements**:
- Store private tasks as notes (use `PrivateSet<ValueNote>`)
- Track total tasks publicly (`PublicMutable<u64>`)
- Private function to add tasks
- Public function to get total task count
- Utility function to get user's task count

**Solution Hints**:
<details>
<summary>Click to see the storage structure</summary>

```rust
#[storage]
struct Storage<Context> {
    tasks: Map<AztecAddress, PrivateSet<ValueNote, Context>, Context>,
    total_tasks: PublicMutable<u64, Context>
}
```

</details>

<details>
<summary>Click to see the add task function pattern</summary>

```rust
#[private]
fn add_task(owner: AztecAddress, task_value: Field) {
    // Add private task
    let note = storage.tasks.at(owner).insert(ValueNote::new(task_value, owner));
    let _ = note.emit(
        encode_and_encrypt_note(&mut context, context.msg_sender()),
    );

    // Enqueue public function to increment counter
    TaskManager::at(context.this_address())
        .increment_total()
        .enqueue(&mut context)
}

#[public]
#[internal]
fn increment_total() {
    let current = storage.total_tasks.read();
    storage.total_tasks.write(current + 1);
}
```

</details>

**Test Your Understanding**: Can you explain why we use `#[internal]` on `increment_total()`?


## Getting Started

1. Clone the [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate)
2. Follow the setup instructions in the README
3. Examine the existing Counter contract to see patterns in action

## Key Concepts to Apply

As you build, keep these principles in mind:

**Privacy vs. Transparency**: Think about what data needs to be private and what can be public. Not everything needs to be private - public state is simpler and sometimes necessary for coordination.

**Function Types Matter**: Choose the right function type for each operation. Private functions hide data, public functions provide transparency, utility functions query offchain, and initializers set up contracts.

**Custom Notes**: If you need to store complex private data, define custom note types. They give you precise control over what's stored and how it's structured.

**Compilation Workflow**: Get comfortable with the compile-postprocess-artifact cycle. Understanding what each step produces will help you debug issues.

## Next Steps

Once you've built something and gotten it compiling:

- **Test it**: Write tests to verify your contract behaves correctly
- **Experiment**: Try different approaches and see what works
- **Iterate**: Start simple, get it working, then add features

Building real contracts is how you'll truly internalize these concepts. Don't worry about making mistakes - they're part of the learning process.

## Additional Resources

- [Aztec Noir Boilerplate](https://github.com/defi-wonderland/aztec-boilerplate) - Your starting point
- [Aztec.nr Reference](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr) - Library documentation
- [Noir Language Documentation](https://noir-lang.org/docs) - Noir syntax and patterns

---

**Ready to build?** Clone the boilerplate and start creating. The skills you've learned in this section are meant to be used, not just understood. Happy building!
