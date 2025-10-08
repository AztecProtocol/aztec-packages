---
title: "Aztec Boilerplate"
description: "Jump-start your Aztec development with a pre-configured boilerplate featuring contracts, tests, and best practices"
tags:
  [
    development environment,
    setup,
    getting started,
    boilerplate,
    development tools,
  ]
---

Now that you have your Sandbox running, let's explore a practical starting point for Aztec development! The Aztec boilerplate repository provides a solid foundation with everything you need to begin building privacy-preserving smart contracts.

## What is the Aztec Boilerplate?

Think of the boilerplate as your starter kit - it's like getting a partially assembled model where the tricky foundation work is already done, letting you focus on building your unique features. Created by the DeFi Wonderland team, this boilerplate gives you a pre-configured Aztec workspace with example contracts, tests, and development tools all wired together.

You can find it here: https://github.com/defi-wonderland/aztec-boilerplate

## What's Inside?

The boilerplate includes several helpful components to accelerate your learning:

### Sample Counter Contract

The repository includes a simple but powerful Counter contract that demonstrates key Aztec concepts:

- **Private-to-public execution pattern** - How private functions enqueue public functions (the most important pattern!)
- **Public state management** - Using `PublicImmutable` and `PublicMutable` storage
- **Internal functions** - Access control with `#[internal]` attribute
- **View functions** - Read-only queries with `#[view]`
- **Selective privacy** - Private actions with public results

This isn't just a "Hello World" - it's a carefully designed learning tool that demonstrates the core execution flow you'll use in every Aztec contract. The counter value is public, but WHO increments it remains private!

### Project Structure

The boilerplate organizes code in a clean, intuitive way:

```
src/
├── nr/          # Your Noir contracts live here
├── ts/          # TypeScript tests and scripts
└── artifacts/   # Generated contract bindings (created automatically)
```

### Pre-configured Testing

One of the best features is the complete testing setup:

- **Automatic Sandbox management** - Tests automatically start and stop the Aztec Sandbox
- **Noir unit tests** - Test contract logic directly
- **TypeScript integration tests** - Test how contracts interact with each other and with users
- **Performance benchmarking** - Automatically measures gas costs and circuit constraints

## Getting Started

Let's get the boilerplate up and running. Don't worry if some concepts aren't clear yet - we'll explore them in detail throughout your learning journey.

### Step 1: Clone the Repository

```bash
git clone https://github.com/defi-wonderland/aztec-boilerplate.git
cd aztec-boilerplate
```

### Step 2: Install Aztec Tools

Make sure you have the Aztec tools installed at the correct version. If you haven't already:

```bash
aztec-up -v <version>
```

### Step 3: Install Dependencies

```bash
yarn install
```

### Step 4: Build the Contracts

```bash
yarn build
```

This command compiles your Noir contracts and generates TypeScript bindings - essentially creating a bridge between your smart contracts and your tests or application code.

### Step 5: Run the Tests

```bash
yarn test
```

Watch as the tests automatically spin up a local Aztec Sandbox, deploy contracts, and run through various scenarios. Pretty cool, right?

## Your First Complete Contract: The Counter Walkthrough

Now for the exciting part - let's explore the Counter contract in detail! This walkthrough bridges what you learned in Modules 1-3 with what's coming in Module 5. By the end, you'll understand how a real Aztec contract is structured and how it brings together all the concepts you've learned.

Remember the transaction lifecycle from Module 3? We're about to see it in action with the private → public execution flow! Remember the privacy mindset from Module 2? You'll see selective privacy in practice - private actions with public results. This is where everything comes together!

**A Quick Note:** This contract uses public state to keep things simple while you learn the fundamentals. In Module 5, you'll dive deep into private state with notes and commitments. Think of this as learning to walk before you run!

### Opening the Contract

Navigate to `src/nr/counter_contract/src/main.nr` in the boilerplate repository. Let's walk through the actual contract code section by section:

### Imports and Contract Declaration

```rust
use aztec::macros::aztec;
pub mod test;

#[aztec]
pub contract Counter {
    use aztec::{
        macros::{functions::{initializer, internal, private, public, view}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::{PublicImmutable, PublicMutable}
    };
```

**Breaking this down:**

- `use aztec::macros::aztec` - Imports the main Aztec macro. `aztec` is defined as a dependency in `Nargo.toml`
- `#[aztec]` - This attribute tells the Noir compiler "this is an Aztec contract - process it for the network"
- Inside the contract, we import specific types we'll need:
  - Function attributes (`initializer`, `internal`, `private`, `public`, `view`)
  - `AztecAddress` - The type for Aztec addresses
  - State variable types (`PublicImmutable`, `PublicMutable`)

Think of these imports as gathering your tools before starting to build!

### Storage Section

```rust
#[storage]
struct Storage<Context> {
    owner: PublicImmutable<AztecAddress, Context>,
    counter: PublicMutable<u128, Context>
}
```

Here's where we define the contract's persistent state. Let's break it down:

**Owner Storage:**
- `owner: PublicImmutable<AztecAddress, Context>`
  - Stores the contract owner's address
  - `PublicImmutable` means it's set once and never changes
  - Everyone can see who the owner is (transparency!)
  - Perfect for ownership that shouldn't be transferable

**Counter Storage:**
- `counter: PublicMutable<u128, Context>`
  - Stores a single counter value as a 128-bit unsigned integer
  - `PublicMutable` means it can be read and updated
  - This is public state - everyone can see the current value
  - Uses the account-based model (direct read/write) from Module 2

**Why This Design?** This contract demonstrates public state management - great for learning the basics before diving into private state complexity. It shows that not everything needs to be private; sometimes transparency is exactly what you want!

### The Constructor

```rust
#[public]
#[initializer]
fn constructor(owner: AztecAddress) {
    storage.owner.initialize(owner);
}
```

When the contract is deployed, this function runs exactly once:

**The Attributes:**
- `#[public]` - This runs on the sequencer, not privately
- `#[initializer]` - Marks this as the constructor function
- Can only be called once during contract deployment

**What It Does:**
- Takes an `owner` address as a parameter
- Calls `storage.owner.initialize(owner)` to set the owner
- `initialize` is used for `PublicImmutable` - it sets the value permanently
- After this runs, the owner cannot be changed (immutable!)

**Connecting to Module 3:** Remember how we discussed contract deployment in the transaction lifecycle? This constructor runs during that deployment as a public function on the sequencer!

### Public View Function: Get Owner

```rust
#[public]
#[view]
fn get_owner() -> AztecAddress {
    storage.owner.read()
}
```

This is a simple getter function:

**The Function:**
- `#[public]` - Runs on the sequencer
- Returns `AztecAddress` - The owner's address
- `storage.owner.read()` - Reads the immutable owner value

**Why It's Useful:**
- Anyone can query who the owner is
- No transaction needed (it's a view)
- Useful for UI to display owner information
- Demonstrates reading public immutable state

### Private Function: Increment

```rust
#[private]
fn increment() {
    Counter::at(context.this_address()).increment_internal().enqueue(&mut context);
}
```

Now here's where it gets interesting! This is a private function that enqueues a public call:

**The `#[private]` Attribute:**
- Marks this function as executing client-side
- Remember from Module 2? This runs in your PXE (Private Execution Environment)
- Generates a zero-knowledge proof of execution

**What the Code Does:**
1. `Counter::at(context.this_address())` - Gets a reference to this contract
2. `.increment_internal()` - Specifies which function to call
3. `.enqueue(&mut context)` - Queues this call for public execution

**The Magic Behind the Scenes:**
When you call this function, here's what actually happens (connecting to Module 3):

1. **Private Execution (Your Device):**
   - Your PXE executes this function locally
   - It generates a proof that you called it
   - The function enqueues a call to `increment_internal()`

2. **Public Execution (Sequencer):**
   - After private execution completes, the sequencer runs `increment_internal()`
   - The counter is actually incremented in public state
   - Everyone can see the counter increased (but not who called increment!)

**Why This Pattern?**
- The **call** is private (who incremented? we don't know!)
- The **result** is public (counter value is visible)
- This demonstrates the directional flow from Module 3!
- Private can enqueue public, but not the other way around

### Public View Function: Get Counter

```rust
#[public]
#[view]
fn get_counter() -> u128 {
    storage.counter.read()
}
```

This function lets anyone query the current counter value:

**The Attributes:**
- `#[public]` - Runs on the sequencer
- `#[view]` - Indicates this doesn't modify state (read-only)
- Returns `u128` - The current counter value

**What It Does:**
- `storage.counter.read()` - Reads the current counter value from public storage
- Returns it directly to the caller
- No state changes, no transaction needed for queries

**Using It:**
```typescript
const currentValue = await contract.methods.get_counter().simulate();
console.log(`Counter is at: ${currentValue}`);
```

The `#[view]` attribute is important - it signals to tools and developers that this function is safe to call anytime for information without worrying about side effects or fees.

### Public Internal Function: Increment Internal

```rust
#[public]
#[internal]
fn increment_internal() {
    let current_value = storage.counter.read();
    storage.counter.write(current_value + 1);
}
```

This is the function that actually increments the counter:

**The Attributes:**
- `#[public]` - Runs on the sequencer, everyone can see it
- `#[internal]` - Can only be called by the contract itself, not external users

**What It Does:**
1. `let current_value = storage.counter.read()` - Read current counter value
2. `storage.counter.write(current_value + 1)` - Write back the incremented value
3. Simple increment logic!

**Why `#[internal]`?**
- This prevents anyone from calling `increment_internal()` directly
- It can only be called through the `increment()` function
- This is an access control pattern - users must go through the private function
- The contract can call its own internal functions via the enqueue pattern

**The Complete Flow:**
1. User calls `increment()` (private function)
2. Private execution generates proof
3. Public `increment_internal()` gets enqueued
4. Sequencer executes `increment_internal()`
5. Counter is incremented in public state

**Why This Design?**
This pattern allows for future extensions. For example, you could:
- Add access control checks in the private function
- Log private information before the public update
- Perform complex validation privately before the simple public update

## Putting It All Together

Let's trace through a complete user flow to see how everything connects:

### Scenario: Alice Increments the Counter

**Step 1: Alice Calls `increment()`**
```typescript
await contract.methods.increment().send().wait();
```

**Step 2: Private Execution (On Alice's Device)**
- Alice's PXE executes the `increment()` function
- The function enqueues a call to `increment_internal()`
- PXE generates a zero-knowledge proof that Alice executed this function
- The proof proves "someone called increment correctly" without revealing who

**Step 3: Transaction Submission**
- Proof + enqueued public call sent to sequencer
- The sequencer can't tell it was Alice (privacy!)
- They just see "valid private execution, enqueuing public call"

**Step 4: Public Execution (On Sequencer)**
- Sequencer verifies the private proof
- Sequencer executes the enqueued `increment_internal()` function:
  - Reads current counter value
  - Increments it by 1
  - Writes new value to public storage
- Everyone can see the counter increased (transparency!)
- But nobody knows Alice called it (privacy!)

**Step 5: Sequencing and Block Production**
- Transaction included in block
- State trees updated with new counter value
- Block distributed to network

**Step 6: Settlement**
- Block proof generated by provers
- Proof verified on Ethereum L1
- Transaction is final!

**Step 7: Anyone Checks the Counter**
```typescript
const currentValue = await contract.methods.get_counter().simulate();
console.log(`Counter is now: ${currentValue}`);
```
- View function queries current public state
- Returns the incremented value
- No transaction needed for reading!

**The Beautiful Result:**
- The counter value is public (everyone sees it increased)
- Who incremented it is private (Alice's identity protected)
- This demonstrates selective privacy - public results, private actions!

## Experimenting with the Contract

Now that you understand how it works, let's make some changes! This hands-on experience will cement your understanding.

### Exercise 1: Add a Decrement Function

Try adding a function that decreases the counter:

```rust
#[private]
fn decrement() {
    Counter::at(context.this_address()).decrement_internal().enqueue(&mut context);
}

#[public]
#[internal]
fn decrement_internal() {
    let current_value = storage.counter.read();
    storage.counter.write(current_value - 1);
}
```

**What to do:**
1. Add these two functions to the contract (following the same pattern as increment)
2. Run `yarn build` to recompile
3. Write a test that increments a few times, then decrements
4. Verify the counter value is correct!

**Bonus Challenge:** Add a check to prevent the counter from going below zero:
```rust
assert(current_value > 0, "Counter cannot be negative");
```

### Exercise 2: Add a Reset Function

Let's add a function that resets the counter to zero, but only the owner can call it:

```rust
#[private]
fn reset() {
    Counter::at(context.this_address()).reset_internal().enqueue(&mut context);
}

#[public]
#[internal]
fn reset_internal() {
    // Check caller is the owner
    let owner = storage.owner.read();
    assert(context.msg_sender() == owner, "Only owner can reset");

    // Reset counter
    storage.counter.write(0);
}
```

**What you'll learn:**
- Access control in public functions
- Using `context.msg_sender()` for authorization
- Combining private calls with public access checks

## Key Concepts Reinforced

By walking through this Counter contract, you've now seen in practice:

✅ **From Module 1 & 2:**
- Public state management (account-based model with direct read/write)
- Hybrid execution (private calls triggering public execution)
- Why some state should be public (transparency where needed)
- The difference between immutable and mutable storage

✅ **From Module 3:**
- **Transaction lifecycle** - Full flow from private execution → sequencing → settlement
- **Directional execution flow** - Private functions enqueuing public functions (can't go the other way!)
- **PXE role** - Executes private functions and generates proofs locally
- **Zero-knowledge proofs** - Generated automatically to prove valid execution
- **Selective privacy** - Who called is private, result is public

✅ **Preview of Module 5:**
- **Contract structure** - Imports, storage, functions with attributes
- **Function types** - `#[private]`, `#[public]`, `#[view]`, `#[internal]`, `#[initializer]`
- **Storage types** - `PublicImmutable`, `PublicMutable`
- **Access control patterns** - Using `#[internal]` and `context.msg_sender()`
- **Enqueue pattern** - How to call public functions from private context

## Exploring the Tests

Now look at the tests in `src/ts/`. You'll see how they demonstrate real-world testing patterns:

1. **Set up the testing environment:**
```typescript
import { createPXEClient } from '@aztec/aztec.js';
import { CounterContract } from '../artifacts/Counter.js';

const pxe = await createPXEClient(PXE_URL);
const wallets = await getInitialTestAccountsWallets(pxe);
```

2. **Deploy the contract:**
```typescript
const owner = wallets[0].getAddress();
// First argument is the deployer's wallet
const contract = await CounterContract.deploy(wallets[0], owner)
  // Since wallets may contain multiple accounts, we must specify the address
  .send({ from: wallets[0].getAddress() })
  .deployed();
```

3. **Call functions:**
```typescript
// Send a transaction (private → public flow)
await contract.methods.increment().send({ from: senderAddress }).wait();

// Query state (no transaction needed)
const value = await contract.methods.get_counter().simulate({ from: senderAddress });

// Check owner
const contractOwner = await contract.methods.get_owner().simulate({ from: senderAddress });
```

4. **Make assertions:**
```typescript
expect(value).toBe(1n);
expect(contractOwner).toEqual(owner);
```

**What to Notice:**
- `.send({ from: aztecAddress }).wait()` - Sends transaction from `aztecAddress` and waits for confirmation
- `.simulate({ from: aztecAddress })` - Queries view functions from the specified `aztecAddress` without creating a transaction
- The tests automatically manage the sandbox lifecycle
- TypeScript types are generated from your contract!

This is the full-stack development you'll learn in Module 6! But now you've already seen it in action.

## What's Next?

Congratulations! You've just completed a deep dive into your first complete Aztec contract. This is a major milestone in your learning journey. You now have practical, hands-on experience with:

- Real Aztec contract structure
- Private and public state working together
- The transaction lifecycle in action
- Testing patterns for privacy-preserving contracts

### Moving Forward

Now that you've seen a complete contract and understand how the pieces fit together, you're ready for Module 5 where we'll dive deeper into:

- **Contract Development in Detail** - Formal coverage of everything you just saw in practice
- **Advanced Storage Patterns** - More sophisticated ways to manage private state
- **Custom Notes** - Creating your own note types beyond ValueNote
- **Cross-Contract Communication** - How contracts interact with each other
- **Optimizations** - Making your contracts more efficient

The Counter contract you just explored will serve as your reference point. As you learn new concepts in Module 5, you can always come back to this working example to see them in context.

### Keep Experimenting!

The boilerplate is your playground. Try the exercises we suggested, but don't stop there:

- What happens if you try to decrement below zero? (Add error handling!)
- Can you make a "reset to zero" function?
- How about a "transfer counter value" function?
- Could you add events to track counter changes?

Every experiment teaches you something. Break things, fix them, and learn from the process. That's what the sandbox is for!

## Key Takeaways

This boilerplate walkthrough has given you:

✅ **Hands-On Experience** - You've seen a real Aztec contract, not just theory
✅ **Concept Integration** - Everything from Modules 1-3 came together in working code
✅ **Development Workflow** - You know how to build, test, and deploy contracts
✅ **Pattern Recognition** - You understand common patterns you'll use in your own contracts
✅ **Bridge to Module 5** - You're primed and ready for formal contract development training

**Most Importantly:** You now have a working example to reference as you learn. When Module 5 introduces new concepts, you can see them in the context of this Counter contract. When you're building your own contracts, you can use this as a template.

### Important Note: This Contract Uses Public State

You might be wondering: "Wait, I thought Aztec was all about privacy? Why is the counter public?"

Great observation! This Counter contract is designed as a **learning tool** that focuses on:
- The private → public execution pattern (most important!)
- Basic contract structure and syntax
- Function attributes and types
- Testing and deployment workflow

It demonstrates **selective privacy**: the action of calling `increment()` is private (we don't know who called it), but the result is public (everyone sees the counter value).

In Module 5, you'll learn about:
- **Private state with notes** - Using `PrivateSet`, `PrivateMutable`, and custom notes
- **Fully private counters** - Where even the value is hidden
- **Mixed patterns** - Combining private and public state in sophisticated ways
- **When to use each approach** - Making the right privacy trade-offs

This Counter contract is your foundation. Once you understand how contracts work with public state and the private/public execution flow, adding private state becomes straightforward. You'll be building fully private applications before you know it!

### Your Learning Progression

Here's where you are in your journey:

**✅ Completed:**
- Module 1: Understanding why privacy matters
- Module 2: Privacy mindset (notes, commitments, nullifiers)
- Module 3: Transaction lifecycle
- Module 4: Development environment + **First Complete Contract!**

**🎯 Next Steps:**
- Module 5: Deep dive into contract development
- Module 6: Building full-stack applications
- Module 7: Deploying to testnet
- Modules 8-9: Advanced topics and network architecture

You're well on your way to becoming an Aztec developer. Keep up the momentum - the best part is just beginning!
