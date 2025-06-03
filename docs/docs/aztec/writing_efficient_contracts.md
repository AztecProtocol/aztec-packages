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
- **Private functions** are optimised differently, as they are compiled to a circuit to be proven (see [Thinking in Circuits](https://noir-lang.org/docs/explainers/explainer-writing-noir))

:::

## Assessing efficiency

On Aztec (like other L2s) there are several costs/limit to consider...

- L1 costs - execution, blobs, events
- L2 costs - public execution, data, logs
- Local limits - proof generation, execution

### Local Proof generation

Since proof generation is a significant local burden, being mindful of the gate-count of private functions is important. The gate-count is a proportionate indicator of the memory and time required to prove locally, so should not be ignored.

From [here](https://noir-lang.org/docs/explainers/explainer-writing-noir#writing-efficient-noir-for-performant-products), a summary of details to consider (where possible) to avoid hitting local limits:
- Use fields and avoid casting between types
- Use Arithmetic over non-arithmetic operations
- Use static over dynamic values
- Reduce what is inside loops and conditional logic
- Leverage unconstrained execution

Profiling the gate count of a private function can be seen [here](../developers/tutorials/codealong/contract_tutorials/counter_contract#investigate-the-increment-function).

:::note Nested private calls
When private functions are called, the overhead of a "kernel circuit" is added each time, so be mindful of calling/nesting too many private functions. This may influence the design towards larger private functions rather than conventionally atomic functions.
:::

### L2 Data costs

Of the L2 costs, the public/private data being updated is most significant. Like on Ethereum, if a lot of data is written/updated, then tx/block limits may be reached.

### L1 Limits

While most zk rollups don't leverage the zero-knowledge property like Aztec, they do leverage the succinctness property.
That is, what is stored in an L1 contract is simply a hash.

For data availability, blobs are utilized since data storage is often cheaper here than in contracts. Like other L2s such costs are factored into the L2 fee mechanisms. These limits can be seen and iterated on when a transaction is simulated/estimated.

## Example using unconstrained to reduce L2 reads

If a struct has many fields to be read, we can design an extra variable maintained as the hash of all values within it (like a checksum). When it comes to reading, we can now do an unconstrained read (incurring no read requests), and then check the hash of the result against that stored for the struct. This final check is thus only one read request rather than one per variable.

:::note Leverage unconstrained functions
When needing to make use of large private operations (eg private execution or  many read requests), use of [unconstrained functions](https://noir-lang.org/docs/explainers/explainer-writing-noir#leverage-unconstrained-execution) wisely to reduce the gate count of private functions.
:::
