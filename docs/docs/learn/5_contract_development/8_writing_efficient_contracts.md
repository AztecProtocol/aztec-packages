---
title: Writing Efficient Contracts
tags: [contracts, optimization, gas, performance, best-practices]
description: Learn optimization techniques and best practices for writing gas-efficient Aztec smart contracts that minimize proving costs
sidebar_position: 8
source: "developers/docs/guides/smart_contracts/advanced/writing_efficient_contracts.md"
---

## Optimizing for Privacy and Performance

Writing efficient Aztec contracts is both an art and a science. Unlike traditional smart contracts where you only worry about gas costs, with Aztec you're balancing three factors: **gas costs**, **proof generation time**, and **proof size**. The good news? Many optimization techniques help with all three!

Think of optimization like packing for a trip - you want to bring everything you need while keeping your luggage as light as possible. In Aztec, every computation in a private function adds to your "proving weight," so smart optimization can dramatically improve user experience.

## What You'll Learn

By the end of this section, you'll understand:

- **The Aztec cost model** - What makes contracts expensive and why
- **Circuit optimization** - Reducing constraints in private functions
- **State management strategies** - Efficient note handling and storage patterns
- **Gas optimization** - Minimizing L1 and L2 gas costs
- **Proof optimization** - Reducing proving time and proof size
- **Common pitfalls** - What to avoid for better performance
- **Profiling techniques** - Measuring and tracking your optimizations

## Why Efficiency Matters in Aztec

In traditional smart contracts, inefficiency means higher gas fees. In Aztec, inefficiency has broader impacts:

**User Experience:**

- Slow proof generation = users waiting longer for transactions
- High gas costs = fewer people can afford to use your app

**Privacy Trade-offs:**

- More complex circuits = harder to prove privacy guarantees
- Inefficient note management = bloated state, slower queries, higher transaction costs
- Poor optimization = users might skip privacy features

**Network Health:**

- Expensive proofs = network congestion
- Large proofs = more data to verify and store
- Inefficient contracts = wasted sequencer resources

The goal: **Build contracts that are fast to prove, cheap to execute, and a joy to use!**

## Key Optimization Principles

Before diving into specific techniques, remember these core principles:

1. **Optimize private computation** - Every operation in a private function adds constraints and proving times
2. **Batch operations** - Combine multiple actions to amortize costs
3. **Use public when appropriate** - Not everything needs privacy
4. **Optimize note management** - Notes are your main state primitive
5. **Profile before optimizing** - Measure to know what actually matters

---

#include_code writing_efficient_contracts /docs/docs/developers/docs/guides/smart_contracts/advanced/writing_efficient_contracts.md raw

---

## Key Takeaways and Optimization Checklist

### Essential Optimization Strategies

**Circuit Optimization:**

- ✅ Optimize operations in private functions
- ✅ Avoid expensive operations (division, modulo) when possible
- ✅ Batch related operations together
- ✅ Cache results instead of recomputing

**State Management:**

- ✅ Use the right storage type for your needs
- ✅ Pack data into fewer notes when possible
- ✅ Use public state for shared/transparent data
- ✅ Implement efficient note filtering strategies

**Gas Optimization:**

- ✅ Batch transactions when users perform multiple actions
- ✅ Minimize L1 data posted (use private or offchain when possible)
- ✅ Use events strategically (they cost gas!)

**Proof Optimization:**

- ✅ Reduce the number of notes accessed per transaction
- ✅ Simplify private computation logic
- ✅ Use utility functions for read-only operations
- ✅ Profile regularly to identify bottlenecks

### Common Anti-Patterns to Avoid

**❌ Inefficient Note Management:**

```rust
// Bad: Creating many small notes
for i in 0..100 {
    create_note(1); // 100 notes of value 1!
}

// Good: Create one consolidated note
create_note(100); // 1 note of value 100
```

**❌ Unnecessary Computation:**

```rust
// Bad: Computing the same thing multiple times
fn verify_twice(value: Field) {
    let hash1 = pedersen_hash([value]);
    // ... some logic ...
    let hash2 = pedersen_hash([value]); // Recomputing!
}

// Good: Compute once, reuse
fn verify_once(value: Field) {
    let hash = pedersen_hash([value]);
    // ... use hash multiple times ...
}
```

**❌ Unbounded Loops:**

```rust
// Bad: Loop size depends on user input
#[private]
fn process_all(items: [Field; N]) {
    for i in 0..N {  // N could be huge!
        expensive_operation(items[i]);
    }
}

// Good: Limit iterations or use batching
#[private]
fn process_batch(items: [Field; MAX_BATCH]) {
    // MAX_BATCH is a reasonable constant
    for i in 0..MAX_BATCH {
        expensive_operation(items[i]);
    }
}
```

## What's Next?

Congratulations! You now understand how to write efficient Aztec contracts that balance privacy, performance, and cost. This knowledge will help you build applications that users actually enjoy using.

**Next Steps:**

- **Deploy to Testnet** - See your optimizations in action (Module 7)
- **Build Full-Stack** - Integrate optimized contracts with UIs (Module 6)
- **Monitor Performance** - Track real-world metrics in production

**Remember:** Premature optimization is the root of all evil, but informed optimization is the path to great user experience. Profile first, optimize wisely, and always verify your changes!

### Additional Resources

- [Noir Performance Tips](https://noir-lang.org/docs/performance)
- [Circuit Profiling Guide](../../developers/docs/guides/smart_contracts/advanced/how_to_profile_transactions.md)

---

**Ready for the next challenge?** If you've completed this module, you're ready to explore full-stack development in Module 6 or deploy to testnet in Module 7. Choose your own adventure!
