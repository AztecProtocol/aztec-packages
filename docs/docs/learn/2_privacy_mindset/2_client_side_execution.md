---
title: "Client-side execution"
description: "How Aztec enables private and public execution, and how zk proofs make it all possible."
sidebar_position: 2
tags: [privacy, execution, zk, proofs]
---

## Learning objectives

By the end of this lesson, you'll understand:

1. What a zero-knowledge proof is and why it's crucial for privacy
2. The roles of prover and verifier in the ZK ecosystem
3. Who acts as prover and verifier in Aztec transactions
4. Why Noir exists and how it makes writing private smart contracts accessible

## Why client-side execution matters

You might be wondering: "If we're running computations on our own devices, how can the network trust what we're doing is legitimate?" This is exactly the challenge Aztec solves, and it's where the magic of zero-knowledge proofs comes in.

Think about traditional blockchains like Ethereum. When you execute a smart contract, every node in the network runs the same computation to verify it's correct. This works for transparency, but it means everyone can see your data. Not ideal when you're dealing with sensitive information like financial records, personal data, or business logic.

Aztec flips this model on its head. Instead of everyone executing your transaction, you execute it privately on your own device, then provide mathematical proof that you did it correctly. It's like solving a complex puzzle in private, then showing everyone a certificate that proves you solved it - without revealing the solution itself.

## Understanding zero-knowledge proofs

### What exactly is a ZK proof?

Let's start with an analogy that might help. Imagine you want to prove to a friend that you know the combination to a lock, but you don't want to tell them what the combination is. You could simply open the lock in front of them. They'd know you have the combination (because the lock opened), but they still wouldn't know what numbers you used.

Zero-knowledge proofs work similarly but with math. They allow you to prove statements like:

- "I have enough funds for this transfer" (without revealing your balance)
- "I'm authorized to update this record" (without revealing your identity)
- "This computation was done correctly" (without revealing the inputs)

In technical terms, a zero-knowledge proof is a cryptographic method where one party (the prover) can prove to another party (the verifier) that a statement is true, without revealing any information beyond the validity of the statement itself.

### The power of verifiable computation

Here's where it gets really interesting. ZK proofs don't just hide data - they also enable _verifiable computation_. This means you can:

1. Run a complex program on your computer
2. Generate a proof that you ran it correctly
3. Send this proof to others who can verify it in milliseconds

The verification is incredibly fast compared to re-running the entire computation. Think of it like this: solving a 1000-piece jigsaw puzzle might take hours, but verifying that someone else solved it correctly (by looking at the completed puzzle) takes seconds.

This property is what makes client-side execution practical. Your device does the heavy lifting of running the computation and generating the proof, while the network only needs to do the lightweight verification.

## The prover and verifier dance

### Understanding the roles

In the world of zero-knowledge proofs, there are always two parties:

**The Prover** (that's you!):

- Executes the actual computation
- Has access to private inputs (your data)
- Generates a mathematical proof of correct execution
- Sends the proof to the network

**The Verifier** (the Aztec network):

- Receives the proof from the prover
- Checks the proof's validity using public verification keys
- Accepts or rejects the transaction based on the proof
- Never sees your private data!

### Proving and verification keys: The magical key pair

You might be thinking, "How does the verifier know what to check?" This is where proving and verification keys come in. Think of them as a special pair of puzzle pieces that fit together perfectly:

- **Proving Key**: A large file that contains all the mathematical constraints of your program. Your PXE uses this to generate proofs.
- **Verification Key**: A small file that contains the essential information needed to verify proofs. The network uses this to check your work.

These keys are generated once when a smart contract is deployed, and they mathematically encode what the contract is supposed to do. It's impossible to generate a valid proof that doesn't follow the contract's rules - the math simply won't work out.

## Who's who in Aztec?

Let's map this to the Aztec ecosystem:

### When you're the prover

Every time you interact with a private function in an Aztec smart contract, your PXE (Private Execution Environment) becomes a prover:

1. It executes the contract function locally with your private inputs
2. It generates a zero-knowledge proof that the execution was correct
3. It sends this proof to the network along with any public outputs

All of this happens automatically - you don't need to think about it! From your perspective, you're just calling a function like you would in any other smart contract platform.

### When the network is the verifier

Once your transaction reaches the network:

1. Sequencers collect your proof along with others
2. The proofs are verified using the contract's verification keys
3. Only valid proofs are included in blocks
4. The final block proof is verified on Ethereum L1

This multi-layered verification ensures that even though computations happen privately on individual devices, the entire network maintains integrity and consensus.

## Enter Noir: Making ZK accessible

### Why we need a Domain Specific Language (DSL)

At this point, you might wonder, "Can't we just use existing programming languages for this?"

Here's the challenge: zero-knowledge proofs require programs to be expressed as mathematical circuits - essentially huge systems of equations. Traditional programming languages like JavaScript or Python weren't designed for this. Trying to write ZK circuits directly would be like trying to write a novel using only mathematical equations - technically possible, but incredibly painful!

### What Noir brings to the table

This is where Noir comes in. Noir is a domain-specific language (DSL) that looks and feels like Rust, but is specifically designed for writing zero-knowledge circuits. Here's why it's special:

1. **Familiar syntax**: If you've written Rust, TypeScript, or even C++, Noir will feel comfortable
2. **Circuit optimization**: Noir automatically converts your high-level code into efficient circuits
3. **Built-in privacy primitives**: Common patterns like hashing, signatures, and encryption are baked in
4. **Developer-friendly errors**: Instead of "constraint #4829 failed," you get readable error messages

Think of Noir as your translator. You write human-readable code expressing your business logic, and Noir translates it into the mathematical language that zero-knowledge proof systems understand.

### A simple example

Here's what a basic Noir function might look like:

```rust
fn transfer(
    balance: Field,
    amount: Field,
    recipient: AztecAddress
) {
    // This assertion becomes a mathematical constraint in the circuit
    assert(balance >= amount, "Insufficient balance");

    // Your business logic here
    let new_balance = balance - amount;

    // More logic...
}
```

When compiled, this simple function becomes thousands of mathematical constraints that ensure the balance check is enforced, even though the actual balance value remains private!

## The magic of recursive proofs

Before we dive into the different types of circuits, let's talk about one of the most mind-blowing concepts in zero-knowledge cryptography: recursive proofs.

### Proofs all the way down

Here's something that might blow your mind: you can create a zero-knowledge proof that verifies other zero-knowledge proofs! This is called recursion, and it's a bit like those Russian nesting dolls where each doll contains a smaller doll inside.

Imagine you have 100 people who each want to prove they completed a task correctly. Instead of having someone verify all 100 proofs individually (which would take time), you could:

1. Have person #1 prove their task was done correctly
2. Have person #2 prove both their task AND that they verified person #1's proof
3. Have person #3 prove their task AND that they verified person #2's proof (which already includes person #1)
4. Continue this chain...

By the time you reach person #100, they're providing a single proof that encompasses all 100 tasks! The verifier only needs to check this one final proof to know all 100 tasks were completed correctly.

### How Aztec uses recursion

This recursive proof technique is fundamental to how Aztec achieves both privacy and scalability. Here's how it works in practice:

1. **Your transaction creates a proof** (proving your private function executed correctly)
2. **The kernel circuit creates a proof** that verifies your proof plus adds protocol checks
3. **Multiple kernel proofs are aggregated** into a single proof by the rollup circuits
4. **Many rollup proofs are combined** into an even more compressed proof
5. **Finally, one root proof** is submitted to Ethereum that represents potentially thousands of transactions

Each layer verifies the proofs from the previous layer, creating a tree structure where the root proof at the top guarantees the validity of everything below it.

### Why this matters

Recursive proofs give us two superpowers:

1. **Compression**: Thousands of transactions can be compressed into a single, small proof that Ethereum can verify quickly
2. **Privacy preservation**: Each layer can hide information from the layer above while still proving correctness

With recursion, Ethereum just verifies one proof that mathematically guarantees all the transactions are valid. It's elegant, efficient, and kind of magical!

## Application circuits vs. protocol circuits

Now let's talk about the two types of circuits in Aztec. This distinction is important because it affects who writes them and how they're used.

### Application circuits: Your smart contracts

These are the circuits you write as a developer:

- **Created by**: Smart contract developers
- **Purpose**: Implement your specific business logic
- **Written in**: Noir, using the Aztec.nr framework
- **Examples**: Token transfers, DeFi protocols, gaming logic, governance systems
- **Flexibility**: Completely customizable to your needs

When you write a private function in your Aztec smart contract, you're creating an application circuit. The Aztec.nr framework provides you with building blocks like state management, note handling, and authentication - you just focus on your application's unique logic.

### Protocol circuits: The Aztec machinery

These circuits are the engine that makes Aztec work:

- **Created by**: The Aztec protocol core developers
- **Purpose**: Enforce protocol rules and maintain system integrity
- **Types**: Kernel circuits, rollup circuits, and merge circuits
- **Examples**:
  - **Private kernel circuit**: Verifies your private function executed correctly
  - **Public kernel circuit**: Processes public function calls
  - **Rollup circuits**: Aggregate multiple transactions into blocks
  - **Root rollup circuit**: Produces the final proof submitted to Ethereum

You don't write these circuits, but they work behind the scenes to ensure your application circuits integrate properly with the rest of the network. Think of them as the operating system that your applications run on.

### How they work together

Here's the beautiful part - these two types of circuits work in harmony using the recursive proof technique we just learned about:

1. You execute your **application circuit** (your smart contract function)
2. The **private kernel circuit** recursively verifies your proof while adding protocol checks
3. If needed, **public kernel circuits** handle any public execution
4. **Rollup circuits** recursively aggregate many kernel proofs together
5. The **root rollup circuit** creates the final recursive proof for Ethereum

Each circuit doesn't just process data - it verifies the proofs from the previous layer while adding its own logic. This creates a chain of trust from your application all the way to Ethereum, with each layer mathematically guaranteeing the correctness of everything that came before it.

## Putting it all together

Let's trace through what happens when you make a private token transfer:

1. **You initiate**: "Send 100 tokens to Alice"

2. **Your PXE springs into action**:

   - Retrieves your private balance note
   - Executes the transfer function locally
   - Generates a ZK proof using the contract's proving key
   - Creates new encrypted notes for Alice

3. **The proof journey begins**:

   - Your application circuit proof is wrapped by kernel circuits
   - The wrapped proof is sent to the network
   - Sequencers verify it using the verification key
   - Multiple proofs are aggregated into a block

4. **Final settlement**:
   - The block proof is submitted to Ethereum
   - Ethereum verifies the proof (taking just milliseconds!)
   - The state update is finalized

Throughout this entire process, your balance, Alice's address, and the amount remain completely private. The network only sees encrypted data and a proof that says "this transaction is valid."

## Why this matters for you

Understanding client-side execution and ZK proofs isn't just academic - it fundamentally changes how you think about building applications:

- **True privacy**: Your users' data stays on their devices
- **Selective disclosure**: Reveal only what you choose to reveal
- **Compliance-friendly**: Prove compliance without exposing sensitive data
- **Scalability**: Verification is fast, regardless of computation complexity

Don't worry if some of these concepts still feel abstract. In the upcoming lessons, we'll write actual Noir code and see these principles in action. You'll be amazed at how quickly it clicks once you start building!

## Key takeaways

Before we move on, let's reinforce what you've learned:

- **Client-side execution** means your device does the computation, keeping your data private
- **Zero-knowledge proofs** let you prove something is true without revealing the details
- **You're the prover** when you execute transactions; the network is the verifier
- **Noir** is a specialized language that makes writing ZK circuits feel like normal programming
- **Application circuits** (your code) work together with **protocol circuits** (Aztec's code) to create a complete privacy system

## Next steps

Now that you understand how client-side execution works, you're ready to dive deeper into Aztec's architecture. In the next lesson, we'll explore the state model - how Aztec manages data in a way that preserves privacy while ensuring consistency across the network.

Remember, this technology might seem complex at first, but you're learning something truly revolutionary. Every major advancement in computing seemed impossibly complex until it became second nature. Keep going - you're doing great!
