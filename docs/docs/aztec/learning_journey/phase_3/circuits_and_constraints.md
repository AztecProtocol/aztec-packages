---
title: "Circuits and Constraints"
description: "Understanding how computations are represented as mathematical circuits for zero-knowledge proof generation."
sidebar_position: 2
tags: [circuits, constraints, computation, proof-generation]
---

# Circuits and Constraints

## From Code to Circuits: The Translation Challenge

When you write a private function in Aztec.nr, your code needs to be converted into a format that can generate zero-knowledge proofs. This format is called a **circuit**.

Think of a circuit as a mathematical representation of your computation that can be verified without revealing the inputs.

## What is a Circuit?

### The Electronic Circuit Analogy

Just like electronic circuits process electrical signals through logic gates, **cryptographic circuits** process data through mathematical constraints.

```
Electronic Circuit:
Input A ──┐
          AND Gate ── Output
Input B ──┘

Cryptographic Circuit:  
Input a ──┐
          × (multiply) ── output
Input b ──┘
```

### Mathematical Representation

A circuit is essentially a system of equations (constraints) that must all be satisfied:

```
Simple Example Circuit:
├── Input: secret value x
├── Constraint 1: y = x × x (square the input)
├── Constraint 2: z = y + 5 (add 5 to the result)
└── Output: z (public result)

For the proof to be valid, ALL constraints must be satisfied
```

## Constraints: The Building Blocks

### What is a Constraint?

A **constraint** is a mathematical rule that must be true for the circuit to be valid. Think of constraints as equations that must be satisfied.

**Basic constraint types:**

**Addition:**
```
a + b = c
Example: 3 + 4 = 7
```

**Multiplication:**
```
a × b = c  
Example: 3 × 4 = 12
```

**Equality:**
```
a = b
Example: secret_value = 42
```

### Constraint Example: Proving Age

Let's say you want to prove you're over 18 without revealing your exact age:

```
Circuit for "I'm over 18":
├── Private input: age (secret)
├── Public input: minimum_age = 18
├── Constraint 1: difference = age - minimum_age  
├── Constraint 2: is_valid = check_positive(difference)
└── Public output: is_valid = true

The proof shows is_valid = true without revealing age
```

## From High-Level Code to Constraints

Let's trace how a simple Aztec.nr function becomes a circuit:

### Original Aztec.nr Code
```rust
fn private_transfer(amount: u64, recipient: AztecAddress) {
    // Check sender has enough balance
    let sender_balance = get_balance();
    assert(sender_balance >= amount);
    
    // Create new notes
    create_note_for(recipient, amount);
    create_change_note(sender_balance - amount);
}
```

### Step 1: Decompose into Basic Operations
```
Operations needed:
├── Load sender_balance (private input)
├── Compare: sender_balance >= amount
├── Subtract: change = sender_balance - amount  
├── Create recipient note with amount
└── Create change note with change amount
```

### Step 2: Convert to Constraints
```
Circuit constraints:
├── balance_constraint: sender_balance = sum_of_input_notes
├── sufficient_funds: is_greater_equal(sender_balance, amount)
├── conservation: sender_balance = amount + change
├── recipient_note: create_note(recipient, amount)
└── change_note: create_note(sender, change)
```

### Step 3: Witness Generation
```
Private witness (secret inputs):
├── sender_balance = 100
├── input_notes = [note1: 60, note2: 40]
├── sender_private_key = 0x123...
└── recipient_address = 0xabc...

Public inputs:
├── amount = 25
├── note_commitments = [hash1, hash2, hash3]
└── nullifiers = [null1, null2]
```

## Circuit Compilation Process

### From Code to Proofs

```
Aztec.nr Code
     ↓
Noir Compiler  
     ↓
Circuit Representation
     ↓  
Constraint System
     ↓
Proof Generation (PXE)
     ↓
Zero-Knowledge Proof
     ↓
Network Verification
```

## Types of Constraints

### Arithmetic Constraints

The most basic building blocks:

```
Addition: a + b = c
Multiplication: a × b = c
Subtraction: a - b = c (converted to a + (-b) = c)
Division: Not directly supported (use inverse multiplication)
```

### Boolean Constraints

For true/false logic:

```
Boolean values: 0 or 1 only
AND: a × b = c (both must be 1 for result to be 1)
OR: a + b - (a × b) = c  
NOT: 1 - a = b
```

### Comparison Constraints

For greater-than, less-than comparisons:

```
Range proofs: Prove a value is within a range
Example: age >= 18 without revealing exact age
Implementation: Decompose into bit constraints
```

### Hash Constraints

For cryptographic operations:

```
Hash function constraints: hash(input) = output
Used for:
├── Note commitments
├── Nullifier generation  
├── Merkle tree verification
└── Address derivation
```

## Circuit Optimization

### Why Optimization Matters

Each constraint in your circuit affects:
- **Proof generation time** - more constraints = slower proving
- **Proof size** - though SNARKs keep this small
- **Memory usage** - during proof generation
- **Gas costs** - for on-chain verification

### Common Optimization Techniques

**Constraint Minimization:**
```
Less efficient:
├── a × a = a²
├── b × b = b²  
├── a² + b² = c

More efficient:
├── temp1 = a × a
├── temp2 = b × b
├── c = temp1 + temp2
```

**Batch Operations:**
```
Instead of: hash(a), hash(b), hash(c)
Use: hash(a || b || c) // concatenate then hash once
```

**Reuse Intermediate Values:**
```
If you compute x × y multiple times, 
store the result and reuse it
```

## Understanding Circuit Limitations

### What's Easy in Circuits
- **Arithmetic operations** - addition, multiplication
- **Hash functions** - cryptographic hashing
- **Fixed-size operations** - operations on known-size data
- **Boolean logic** - AND, OR, NOT operations

### What's Hard in Circuits
- **Loops with unknown bounds** - circuits must be fixed-size
- **Conditional logic** - requires boolean constraint patterns
- **Dynamic memory allocation** - all memory must be pre-allocated
- **Floating-point math** - use fixed-point representation instead

### Circuit-Friendly Programming

**Good Patterns:**
```rust
// Fixed-size array operations
let mut sum = 0;
for i in 0..10 {
    sum += array[i];
}

// Boolean flags instead of complex conditionals
let is_valid = check_signature(signature, message);
amount = amount * is_valid; // 0 if invalid, preserves if valid
```

**Patterns to Avoid:**
```rust
// Variable-length loops
while condition { /* unknown iterations */ }

// Complex nested conditionals
if complex_condition {
    if another_condition {
        // deep nesting is expensive
    }
}
```

## Debugging Circuits

### Common Circuit Errors

**Constraint Unsatisfied:**
- One of your mathematical equations doesn't hold
- Usually means a bug in your logic

**Witness Generation Failed:**
- Couldn't find values that satisfy all constraints
- Often caused by impossible constraint combinations

**Circuit Too Large:**
- Too many constraints for practical proof generation
- Need to optimize or split into multiple proofs

### Debugging Approaches

**Start Simple:**
- Build minimal versions of your circuit first
- Add complexity gradually
- Test each constraint individually

**Trace Values:**
- Log intermediate values during witness generation
- Verify your math is correct at each step
- Check that constraints match your intentions

## Key Takeaways

1. **Circuits are mathematical representations** of your code that enable zero-knowledge proof generation
2. **Constraints are equations** that must all be satisfied for a valid proof
3. **Circuit-friendly programming** requires thinking about fixed-size operations and mathematical constraints
4. **Optimization matters** for practical performance in proof generation
5. **Debugging circuits** requires understanding the constraint system and mathematical relationships

---

## Next Steps

Now that you understand how computations become circuits, let's explore how Merkle trees enable efficient privacy-preserving verification in these systems.

**Continue to:** [Merkle Trees for Privacy →](/aztec/learning_journey/phase_3/merkle_trees_privacy)

---

**Phase 3 Navigation:**  
[← Zero-Knowledge Proofs](/aztec/learning_journey/phase_3/zk_proofs_explained) | **Circuits and Constraints** | [Merkle Trees for Privacy →](/aztec/learning_journey/phase_3/merkle_trees_privacy)