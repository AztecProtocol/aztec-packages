---
title: "Client-side execution"
description: "How Aztec enables private and public execution, and how zk proofs make it all possible."
sidebar_position: 2
tags: [privacy, execution, zk, proofs]
---

## Learning objectives

By the end of this lesson, you'll understand:

1. Where public and private computation occurs
2. What a zero-knowledge (ZK) proof is and why it's crucial for privacy
3. The roles of prover and verifier in a ZK system
4. Who acts as prover and verifier in Aztec transactions
5. Why Noir exists and how it makes writing private smart contracts accessible

## Aztec smart contracts

You can write and deploy smart contracts to Aztec, just like Ethereum. Exect they work a litle differently:

- Smart contracts are written in [Noir](https://noir-lang.org/) using the [Aztec.nr](https://github.com/AztecProtocol/aztec-packages/tree/next/noir-projects/aztec-nr) framework
- Functions can be **public** or **private**. This is _different_ from function visibility for Solidity smart contracts. Instead of controlling just **who can call the function** as in Solidity, on Aztec, a function being public or private controls **who and how** the function executes. It affects privacy not just access.

Whether a function is **public** or **private** changes the **execution environment**.


## Public and private execution environments

Public functions execute onchain via the nodes in the Aztec network in the public VM.

Private functions are executed client-side in your private execution environment (PXE). This is offchain. This could be:
- In your browser in an application
- Locally when using a CLI
This means that all your private data is not visible to anyone but you. All private data and computation is done offchain, locally.

## Why client-side execution matters for privacy

You might be wondering: "If we're running computations on our own devices, how can the network trust what we're doing is legitimate?" This is exactly the challenge Aztec solves, and it's where the magic of zero-knowledge proofs comes in.

Think about traditional blockchains like Ethereum. When you execute a smart contract, every node in the network runs the same computation to verify it's correct. This works for transparency, but it means everyone can see your data. Not ideal when you're dealing with sensitive information like financial records, personal data, or business logic.

Instead of everyone executing your transaction, you execute it privately on your own device, then **provide mathematical proof that you did it correctly**. It's like solving a complex puzzle in private, then showing everyone a certificate that proves you solved it, without revealing the solution itself.

This is exactly what a zero-knowledge proof is. It is a mathematical way of proving that you know something, or did some computation correctly, without revealing anything about the thing you know or the compution.

## Understanding zero-knowledge proofs

### What is a ZK proof?

Let's start with an analogy that might help. Imagine you want to prove to a friend that you know the combination to a lock, but you don't want to tell them what the combination is. You could simply open the lock in front of them. They'd know you have the combination (because the lock opened), but they still wouldn't know what numbers you used.

Zero-knowledge proofs work similarly but with math. They allow you to prove statements like:

- "I have enough funds for this transfer" (without revealing your balance)
- "I'm authorized to update this record" (without revealing your identity)
- "This computation was done correctly" (without revealing the inputs)

It's worth noting that in Aztec, we often talk about two types of proofs: **validity proofs** that show a computation was done correctly (these don't necessarily hide information) this is what most ZK rollups use for scalability, and **zero-knowledge proofs** that prove something while also hiding private information. Aztec combines both.

:::Key takeaway
In technical terms, a zero-knowledge proof is a cryptographic method where one party (the prover) can prove to another party (the verifier) that a statement is true, without revealing any information beyond the validity of the statement itself.
:::

### Verifiable computation

ZK proofs don't just hide data, they also enable _verifiable computation_. This means you can:

1. Run a complex program on your computer
2. Generate a proof that you ran it correctly
3. Send this proof to others who can verify it in milliseconds

The verification is incredibly fast and cheap compared to re-running the entire computation, regardless of how complex the original computation was. Whether you're proving a simple addition or executing intricate private contract logic with thousands of operations, the resulting proof is compact and verifies in milliseconds. Generating the proof might require significant computation on your device, but once created, the network can verify it nearly instantly. Think of it like this: solving a 1000-piece jigsaw puzzle might take hours, but verifying that someone else solved it correctly (by looking at the completed puzzle) takes seconds.

This is what makes privacy-preserving blockchains practical: verification cost doesn't scale with computational complexity. Your device does the heavy lifting of running the computation and generating the proof, while the network only needs to do the lightweight verification.

## The prover and verifier

### Understanding the roles

In the world of zero-knowledge proofs, there are always two parties:

**The Prover** (that's your PXE!):

- Executes the computation
- Has access to private inputs (your private data)
- Generates a mathematical proof of correct execution
- Sends the proof to the network

**The Verifier** (the Aztec network):

- Receives the proof from the prover
- Checks the proof's validity using public verification keys (don't worry, we are about to explain verification keys)
- Accepts or rejects the transaction based on the proof
- Never sees your private data!

### Proving and verification keys: The magical key pair

How does the verifier know what to check?" This is where proving and verification keys come in. Think of them as a special pair of puzzle pieces that fit together perfectly:

- **Proving Key**: A large file that contains all the mathematical constraints (like specific rules your programme inputs must follow to satisfy the requirements) of your program. Your PXE uses this to generate proofs.
- **Verification Key**: A small file that contains the essential information needed to verify proofs. The network uses this to check your work.

These keys are generated once when a smart contract is deployed, and they mathematically encode what the contract is supposed to do. It's impossible to generate a valid proof that doesn't follow the contract's rules, the math simply won't work out.

## Who's who in Aztec?

Let's map this to the Aztec ecosystem:

### You're the prover

Every time you interact with a private function in an Aztec smart contract, your PXE (Private Execution Environment) becomes a prover:

1. It executes the contract function locally with your private inputs
2. It generates a zero-knowledge proof that the execution was correct
3. It sends this proof to the network along with any public outputs

All of this happens automatically, you don't need to think about it! From your perspective, you're just calling a function like you would in any other smart contract platform.

### The network is the verifier

Once your transaction reaches the network:

1. Sequencers collect your proof along with others
2. The proofs are verified using the verification keys for the contract you are interacting with
3. Only valid proofs are included in blocks
4. The final block proof is verified on Ethereum L1 (this is where we use ZK proofs again for scalability like any other ZK rollup)

This multi-layered verification ensures that even though computations happen privately on individual devices, the entire network maintains integrity and consensus.

## Functions calling other functions

Private functions can call public ones BUT public functions cannot call private ones.

- Private execution happens first on your device. You run private functions locally and generate proof that the execution was done correctly.
- Then, public execution happens on the network. The proofs get submitted and any public functions are called.
- Once execution moves to the public network phase, it cannot return to private execution on your device.

This is like mailing a letter: once you drop it in the mailbox (submit to network), you can't add more private notes to it.

## Noir: Making ZK accessible

### Why we need a Domain Specific Language (DSL)

So we mentioned earlier that we use Noir to write smart contracts on Aztec, but why? Why can't we just use existing programming languages for this?"

Here's the challenge: ZK proofs require programs to be expressed as mathematical circuits - essentially huge systems of equations. Traditional programming languages like JavaScript or Python weren't designed for this. Trying to write ZK circuits directly would be like trying to write a novel using only mathematical equations. Technically possible, but incredibly painful!

### Noir's benefits

Noir is a domain-specific language (DSL) that looks and feels like Rust, but is **specifically designed for writing ZK circuits**. Here's why it's special:

1. **Familiar syntax**: If you've written Rust, TypeScript, or even C++, Noir will feel comfortable
2. **Circuit optimization**: Noir automatically converts your high-level code into efficient circuits
3. **Built-in privacy primitives**: Common patterns like hashing and signatures are baked in
4. **Developer-friendly errors**: Instead of "constraint #4829 failed," you get readable error messages

You write human-readable code expressing your business logic, and Noir translates it into the mathematical language that ZK proof systems understand.

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

## Recursive proofs

Before we dive into the different types of circuits, let's talk about one of the most useful concepts in ZK cryptography: recursive proofs.

### Proofs all the way down

You can create a ZK proof that verifies other ZK proofs! This is called recursion, and it's a bit like those Russian nesting dolls where each doll contains a smaller doll inside.

Imagine you have 100 people who each want to prove they completed a task correctly. Instead of having someone verify all 100 proofs individually (which would take time), you could:

1. Have person #1 prove their task was done correctly
2. Have person #2 prove both their task AND that they verified person #1's proof
3. Have person #3 prove their task AND that they verified person #2's proof (which already includes person #1)
4. Continue this chain...

By the time you reach person #100, they're providing a single proof that encompasses all 100 tasks! The verifier only needs to check this one final proof to know all 100 tasks were completed correctly.

Your private function call proofs are combined together, using recursion, into a single proof. Recursion is also used to verify state transitions for public state and produce batches of transactions.

### Why this matters

Recursive proofs give us three benefits:

1. **Compression**: Thousands of transactions can be compressed into a single, small proof that Ethereum can verify quickly
2. **Privacy preservation**: Each layer can hide information from the layer above while still proving correctness
3. **Cost efficiency**: By aggregating many proofs into one, users share the L1 verification cost. Instead of each person paying to verify their own proof on Ethereum, everyone splits the cost of verifying one combined proof!

With recursion, Ethereum just verifies **one proof** that mathematically guarantees all the transactions are valid! This aggregation is what makes private transactions on Aztec economically viable.

## Application circuits vs. protocol circuits

Now let's talk about the two types of circuits in Aztec. This distinction is important because it affects who writes them and how they're used.

### Application circuits: Your smart contracts

These are the circuits you write as a developer in Noir, using the Aztec.nr framework for example: token transfers, DeFi protocols, gaming logic, governance systems.

When you write a private function in your Aztec smart contract, you're creating an application circuit. The Aztec.nr framework provides you with building blocks like state management, note handling, and authentication. You just focus on your application's unique logic.

### Protocol circuits: The Aztec machinery

These circuits are the engine that makes Aztec work created by the Aztec protocol core developers. They enforce protocol rules and maintain system integrity
**Examples**:
- **Private kernel circuit**: Verifies your private function executed correctly and enforces protocol rules
- **Public kernel circuit**: Processes public function calls and manages state updates
- **Base rollup circuit**: Processes a batch of transactions and produces the first layer of aggregation
- **Merge rollup circuit**: Combines multiple base rollup proofs into larger aggregations
- **Root rollup circuit**: Produces the final proof submitted to Ethereum, representing potentially thousands of transactions

You don't write these circuits, but they work behind the scenes to ensure your application circuits integrate properly with the rest of the network. Think of them as the operating system that your applications run on.

### How they work together

These two types of circuits work in harmony using the recursive proof technique we just learned about:

1. You execute your **application circuit** (your smart contract function)
2. The **private kernel circuit** recursively verifies your proof while adding protocol checks
3. If needed, **public kernel circuits** handle any public execution
4. **Rollup circuits** recursively aggregate many kernel proofs together
5. The **root rollup circuit** creates the final recursive proof for Ethereum

Each circuit verifies the proofs from the previous layer while adding its own logic. Each layer mathematically guarantees the correctness of everything that came before it.

## Putting it all together

[TODO] remove? Seems like it's just a shit version of the next lesson to me?

Let's trace through what happens when you make a private token transfer:

1. **You initiate**: "Send 100 tokens to Alice"

2. **Your PXE**:

   - Retrieves your private balance notes from your local database
   - Executes the transfer function locally with your private data
   - Generates a ZK proof using the contract's proving key
   - Nullifies used notes and creates new notes for Alice with her updated balance

3. **The proof**:

   - Your application circuit proof is wrapped by kernel circuits (the mega, outer circuir)
   - The wrapped proof is sent to the network
   - Sequencers verify it using the verification key
   - Multiple transactions are batched together

4. **Aggregation**:

   - The base rollup circuit processes your transaction batch
   - Layer by layer, multiple base rollup proofs are recursively aggregated
   - Finally, the root rollup circuit creates one proof representing thousands of transactions

5. **Final settlement**:
   - The single aggregated proof is submitted to Ethereum
   - Ethereum verifies this one proof
   - All transactions in the batch are finalized together
   - You share the L1 cost with everyone else in the batch

Throughout this entire process, your balance, Alice's address, and the amount remain completely private. The network only sees that a transaction happened and that it is valid.

## Key takeaways

Before we move on, let's reinforce what you've learned:

- **Client-side execution** means your device does the computation, keeping your data private with selective disclosure
 makes.
- **Zero-knowledge proofs** let you prove something is true without revealing the details with the proof verification being fast regardless of the complexity of the thing being proved (like correct computation).
- **You're the prover** when you execute transactions; the network is the verifier.
- **Recursive proofs** allow you to recursively combine lots of ZK proofs into one to maker verifying lots of data computationally simple.
- **Noir** is a specialized language that makes writing ZK circuits feel like normal programming.
- **Application circuits** (your code) work together with **protocol circuits** (Aztec's code) to create a complete privacy system that combines scalability and privacy.

Don't worry if some of these concepts still feel abstract. In the upcoming lessons, we'll write actual Noir code and see these principles in action.

## Next steps

Now that you understand how client-side execution works, you're ready to dive deeper into Aztec's architecture. In the next lesson, we'll explore the lifecycle of a transaction.

Remember, this technology might seem complex at first, but you're learning something revolutionary. Every advancement in computing seemed impossibly complex until it became second nature. Keep going, you're doing great!
