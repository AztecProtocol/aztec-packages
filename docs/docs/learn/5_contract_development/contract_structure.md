---
title: "Contract Structure"
description: "Master the anatomy of Aztec smart contracts - from basic structure to function attributes and storage management"
sidebar_position: 1
tags: [contracts, noir, development, smart contracts]
---

Welcome to the world of Aztec smart contract development! In this section, you'll learn how Aztec contracts are structured and organized. Think of this as learning the grammar of a new language - once you understand the basic structure, everything else will start to click into place.

## What You'll Learn

By the end of this section, you'll understand:

- How to structure an Aztec contract using the `contract` keyword
- The different types of functions and when to use each one
- How storage works in Aztec contracts
- The powerful attributes and macros that make Aztec development efficient
- How to organize your contract code for clarity and maintainability

Let's dive in!

## The Anatomy of an Aztec Contract

### The Contract Keyword

Every Aztec smart contract starts with the `contract` keyword. This is similar to how Solidity contracts use `contract` or Rust programs use `mod`, but with some Aztec-specific magic happening behind the scenes.

```rust
#[aztec]
contract MyFirstContract {
    // Your contract code goes here
}
```

Notice the naming convention - we use `PascalCase` for contract names. This isn't just style; it's the Aztec way!

### Basic Contract Structure

Here's what a typical Aztec contract looks like:

```rust
#[aztec]
contract TodoList {
    // 1. Imports - bringing in dependencies
    use aztec::{
        macros::{functions::{initializer, private, public, utility, internal}, storage::storage},
    };

    // 2. Storage - defining persistent state
    #[storage]
    struct Storage<Context> {
        todos: Map<Field, PrivateSet<TodoItem, Context>, Context>,
        owner: PublicMutable<AztecAddress, Context>,
    }

    // 3. Custom Types - defining your own private state types
    #[note]
    struct TodoItem {
        title: Field,
        completed: bool,
        owner: AztecAddress,
        randomness: Field,
    }

    // 4. Functions - the contract's behavior
    #[private]
    fn add_todo(title: Field) {
        // Function logic here
    }
}
```

Let's break down each section:

## 1. Imports: Bringing in Dependencies

Just like any programming language, you'll need to import libraries and modules:

```rust
use aztec::{
    macros::{functions::{initializer, private, public, utility, internal}, storage::storage},
};
```

## Storage

### Understanding Storage in Aztec

Here's where Aztec gets interesting! Unlike Ethereum where all storage is public, Aztec gives you choices:

```rust
#[storage]
struct Storage<Context> {
    // Public state - visible to everyone
    total_supply: PublicMutable<Field, Context>,

    // Private state - only visible to authorized parties
    balances: Map<AztecAddress, PrivateSet<TokenNote, Context>, Context>,

    // Shared state - can be read publicly but written privately
    // This is an advanced feature that we'll cover in a future section
    admin: DelayedPublicMutable<AztecAddress, DELAY, Context>,
}
```

The `#[storage]` attribute is doing a lot of work behind the scenes:

- It automatically assigns storage slots to each field
- It injects the context needed for state operations
- It generates initialization functions

When you define storage, you're essentially defining the persistent state of your contract - the data that survives between function calls.

### Storage Types

Aztec provides several storage primitives:

- **PublicMutable**: Public state that can be modified
- **PublicImmutable**: Public state that's set once and never changes
- **PrivateSet**: A collection of private notes
- **PrivateMutable**: Private state that can be modified
- **PrivateImmutable**: Private state that's set once and never changes
- **DelayedPublicMutable**: Public state that can be read in private and modified in public with a delay, so there are guarantees that the value will not change before a certain time
- **Map**: Key-value mappings (can be public or private)

We'll explore these in detail in the next section, but for now, just know that you have options!

## 3. Functions

### Function Types and Attributes

Aztec functions come in different flavors, each with its own features. Let's explore them:

### Private Functions (`#[private]`)

Private functions are the heart of Aztec's privacy model. They execute on the user's device, keeping sensitive data local:

```rust
#[private]
fn increment_counter(to: AztecAddress) {
    // This runs on the user's device
    // The network only sees a proof that it happened correctly
    storage.counters.at(to).add(1, to);
}
```

Why is this powerful? The counter changes, and even who you're sending to remain private. The network only knows that a valid transaction occurred!

### Public Functions (`#[public]`)

Public functions work more like traditional smart contract functions - they execute on the sequencer and everyone can see what happens:

```rust
#[public]
fn increase_total_supply(amount: Field) {
    // This runs on the network
    // Everyone can see this happening
    let new_supply = storage.total_supply.read() + amount;
    storage.total_supply.write(new_supply);
}
```

Use public functions when you need transparency or when dealing with shared state that everyone needs to agree on.

### View Functions (`#[view]`)

Sometimes you just want to read data without changing anything:

```rust
#[public]
#[view]
fn get_total_supply() -> Field {
    storage.total_supply.read()
}
```

The `#[view]` attribute guarantees this function won't modify any state - perfect for queries from other contracts!

### Utility Functions (`#[utility]`)

Utility functions are special - they help you query state from your local PXE (Private eXecution Environment) without creating a transaction:

```rust
#[utility]
fn balance_of_private(owner: AztecAddress) -> Field {
    // This queries your local PXE database
    // No transaction, no fees, just information
    storage.balances.at(owner).balance_of()
}
```

Think of utility functions as your contract's API for reading data - they're perfect for UIs and testing!

### Initializer Functions (`#[initializer]`)

Every contract needs setup. Initializer functions are like constructors:

```rust
#[initializer]
fn constructor(initial_supply: Field, admin: AztecAddress) {
    storage.total_supply.write(initial_supply);
    storage.admin.write(admin);
}
```

Key points about initializers:

- A contract can have multiple initializer functions defined
- Only ONE should be called during the contract's lifetime
- Other functions can't be called until initialization is complete, unless they are marked with `#[noinitcheck]`

### Internal Functions (`#[internal]`)

Sometimes you want a function that only your contract can call:

```rust
#[internal]
#[private]
fn update_admin(new_admin: AztecAddress) {
    // Only callable by the contract itself
    storage.admin.write(new_admin);
}
```

This essentially asserts that the `msg_sender` is the contract itself, so this is useful when you want private functions to trigger state changes indirectly.

## 4. Custom Types: Building Your Data Structures

### Notes: Aztec's Privacy Primitive

Notes are fundamental to Aztec's privacy model. Think of them as private pieces of data that only specific people can see:

For example, if you want to store a value in private state, you can use the `ValueNote` type (from the `Aztec.nr` package):

```rust
#[note]
pub struct ValueNote {
    value: Field,
    owner: AztecAddress,
    randomness: Field,
}
```

The `#[note]` attribute automatically generates:

- Serialization/deserialization methods
- Note hash computation
- Nullifier computation (for spending/destroying notes)

Don't worry if this seems abstract now - we'll dive deep into notes in the privacy section!

## Understanding the Execution Context

Every function in Aztec has access to a `context` object.

```rust
#[private]
fn check_caller() {
    // Who called this function?
    let caller = context.msg_sender();

    // What's the current block number?
    let block_num = context.block_number();

    // What chain are we on?
    let chain_id = context.chain_id();
}
```

The context provides:

- **Caller information** - Who initiated this transaction?
- **Block data** - Current block number, timestamp
- **Chain information** - Which network are we on?
- **Transaction details** - Gas prices, limits

The context differs between private and public functions, but the API is unified - making it easy to work with both! Note that there is different information in the context for private and public functions.

## Project Organization

Here's how to structure your Aztec project for success:

```
my_aztec_project/
├── src/
│   ├── main.nr           # Your main contract
│   ├── types.nr          # Custom types and notes
│   └── utils.nr          # Helper functions
├── tests/
│   └── main_test.nr      # Contract tests
└── Nargo.toml            # Project configuration
```

Pro tips:

- Keep your main contract focused and clean
- Extract complex types into separate modules
- Write tests alongside your contract code

## Common Patterns and Best Practices

### Pattern 1: Access Control

```rust
#[public]
#[internal]
fn admin_only_action() {
    let admin = storage.admin.read();
    assert(context.msg_sender() == admin, "Not authorized");
    // Admin-only logic here
}
```

### Pattern 2: Private-to-Public Communication

```rust
#[private]
fn initiate_public_action(value: Field) {
    // Private function calls public function
    MyContract::at(context.this_address())
        .public_action(value)
        .enqueue(&mut context);
}
```

### Pattern 3: State Transitions

```rust
#[public]
fn update_state(new_value: Field) {
    let current = storage.state.read();
    assert(new_value > current, "Must increase");
    storage.state.write(new_value);
}
```

## Try It Yourself!

Now that you understand contract structure, let's practice:

1. **Create a simple contract** with both private and public functions
2. **Add storage** with both public and private state
3. **Define a custom note type** for your use case
4. **Write an initializer** that sets up initial state

## Common Pitfalls and How to Avoid Them

### Mixing Private and Public State Incorrectly

Remember: Private functions can't directly modify public state. They need to enqueue public function calls.

## Key Takeaways

- **Contract structure** in Aztec follows a clear pattern: imports → storage → types → functions
- **Function attributes** (`#[private]`, `#[public]`, etc.) control where and how functions execute
- **Storage** can be public or private, giving you fine-grained control over data visibility
- **The context object** is your window into the execution environment
- **Notes** are the building blocks of privacy in Aztec

You've just learned the fundamental structure of Aztec smart contracts! This foundation will serve you throughout your Aztec journey. In the next section, we'll dive deeper into state management and explore how public and private storage really work.

## What's Next?

Now that you understand contract structure, you're ready to explore:

- **State Management** - Deep dive into storage types and patterns
- **Privacy Concepts** - Understanding notes, nullifiers, and commitments
- **Contract Interactions** - How contracts talk to each other

Remember, every expert was once a beginner. You're doing great - keep experimenting and building!
