---
title: Writing Efficient Contracts
sidebar_position: 2
tags: [Developers, Contracts]
---

## Writing functions

On Ethereum L1, all data is public and all execution is completely reproducible. The Aztec L2 takes on the challenge of execution of private functions on private data. This is done client side, along with the generation of corresponding proofs, so that the network can verify the proofs and append any encrypted data/nullifiers (privacy preserving state update).

This highlights a key difference with how public vs private functions are written.

:::info Writing efficiently

- **Public functions** can be written intuitively - optimising for execution/gas as one would for EVM L2s
- **Private functions** are optimised differently, as they are compiled to a circuit to be proven locally (see [Thinking in Circuits](https://noir-lang.org/docs/explainers/explainer-writing-noir))

:::

## Assessing efficiency

On Aztec (like other L2s) there are several costs/limit to consider...

- L1 costs - execution, blobs, events
- L2 costs - public execution, data, logs
- Local limits - proof generation time, execution

### Local Proof generation

Since proof generation is a significant local burden, being mindful of the gate-count of private functions is important. The gate-count is a proportionate indicator of the memory and time required to prove locally, so should not be ignored.

#### Noir for circuits

An explanation of efficient use of Noir for circuits should be considered for each subsection under [writing efficient Noir](https://noir-lang.org/docs/explainers/explainer-writing-noir#writing-efficient-noir-for-performant-products) to avoid hitting local limits. The general theme is to use language features that favour the underlying primitives and representation of a circuit from code.

A couple of examples:
- Since the underlying cryptography uses an equation made of additions and multiplications, these are more efficient (wrt gate count) in Noir than say bit-shifting.
- Unconstrained functions by definition do not constrain their operations/output, so do not contribute to gate count. Using them carefully can bring in some savings, but the results must then be constrained so that proofs are meaningful for your application.

:::warning Tradeoffs and caveats
Each optimisation technique has its own tradeoffs and caveats so should be carefully considered with the full details in the linked [section](https://noir-lang.org/docs/explainers/explainer-writing-noir#writing-efficient-noir-for-performant-products).
:::

#### Overhead of nested Private Calls

When private functions are called, the overhead of a "kernel circuit" is added each time, so be mindful of calling/nesting too many private functions. This may influence the design towards larger private functions rather than conventionally atomic functions.

#### Profiling using FlameGraph

Measuring the gate count across a private function can be seen at the end of the counter tutorial [here](../developers/tutorials/codealong/contract_tutorials/counter_contract#investigate-the-increment-function). Full profiling and flamegraph commands explained [here](../developers/guides/smart_contracts/profiling_transactions).

### L2 Data costs

Of the L2 costs, the public/private data being updated is most significant. Like on Ethereum, if a lot of data is written/updated, then tx/block limits may be reached.

### L1 Limits

While most zk rollups don't leverage the zero-knowledge property like Aztec, they do leverage the succinctness property.
That is, what is stored in an L1 contract is simply a hash.

For data availability, blobs are utilized since data storage is often cheaper here than in contracts. Like other L2s such costs are factored into the L2 fee mechanisms. These limits can be seen and iterated on when a transaction is simulated/estimated.


## Examples for private functions (reducing gate count)
### Use arithmetic instead of non-arithmetic operations

Because the underlying equation in the proving backend makes use of multiplication and addition, these operations incur less gates than bit-shifting or bit-masking.

Eg: `n = n * 256` is represented in less gates than `n << 8`

### Loops

Since private functions are circuits, their size must be known at compile time, which is equivalent to its execution trace.
See [this example](https://github.com/noir-lang/noir-examples/blob/master/noir_by_example/loops/noir/src/main.nr#L11) for how to use loops when dynamic execution lengths (ie variable number of loops) is not possible.

### Using unconstrained
#### Reducing gate count

Consider the following example of an implementation of the `sqrt` function:
```rust
use dep::aztec::macros::aztec;

#[aztec]
pub contract OptimisationExample {
    use dep::aztec::macros::{functions::{initializer, private, public, utility}, storage::storage};

    #[storage]
    struct Storage<Context> {}

    #[public]
    #[initializer]
    fn constructor() {}

    #[private]
    fn sqrt_inefficient(number: Field) -> Field {
        super::sqrt_constrained(number)
    }

    #[private]
    fn sqrt_efficient(number: Field) -> Field {
        // Safety: calculate in unconstrained function, then constrain the result
        let x = unsafe { super::sqrt_unconstrained(number) };
        assert(x * x == number, "x*x should be number");
        x
    }

}

fn sqrt_constrained(number: Field) -> Field {
    let MAX_LEN = 100;

    let mut guess = number;
    let mut guess_squared = guess * guess;
    for _ in 1..MAX_LEN as u32 + 1 {
        // only print when beneath len (inclusive)
        if (guess_squared != number) {
            guess = (guess + number / guess) / 2;
            guess_squared = guess * guess;
        }
    }

    guess
}

unconstrained fn sqrt_unconstrained(number: Field) -> Field {
    let mut guess = number;
    let mut guess_squared = guess * guess;
    while guess_squared != number {
        guess = (guess + number / guess) / 2;
        guess_squared = guess * guess;
    }
    guess
}

```

The two implementations after the contract differ in one being constrained vs unconstrained, as well as the loop implementation (which has other design considerations).
Measuring the two, we find the `sqrt_inefficient` to require around 1000 extra gates compared to `sqrt_efficient`.

To see each flamegraph:
- `SERVE=1 aztec flamegraph target/optimisation_example-OptimisationExample.json sqrt_inefficient`
- `SERVE=1 aztec flamegraph target/optimisation_example-OptimisationExample.json sqrt_efficient`

Note: this is largely a factor of the loop size choice based on the expected size of number you'll be calculating the square root of. For larger numbers, the loop would have to be much larger, so perform in an unconstrained way (then constraining the result) is much more efficient.

#### Reducing L2 reads

If a struct has many fields to be read, we can design an extra variable maintained as the hash of all values within it (like a checksum). When it comes to reading, we can now do an unconstrained read (incurring no read requests), and then check the hash of the result against that stored for the struct. This final check is thus only one read request rather than one per variable.

:::note Leverage unconstrained functions
When needing to make use of large private operations (eg private execution or  many read requests), use of [unconstrained functions](https://noir-lang.org/docs/explainers/explainer-writing-noir#leverage-unconstrained-execution) wisely to reduce the gate count of private functions.
:::
