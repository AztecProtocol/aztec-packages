# Public Kernel Circuit - Initial

:::info Disclaimer
This is a draft. These requirements need to be considered by the wider team, and might change significantly before a mainnet release.
:::

## Requirements

The **initial** public kernel iteration undergoes processes to prepare the necessary data for the executions of the public function calls.

### Verification of the Previous Iteration

#### Verifying the previous kernel proof.

It verifies that the previous iteration was executed successfully with the given proof data, verification key, and public inputs.

The preceding proof can only be:

- [Tail private kernel proof](./private-kernel-tail.md).

### Public Inputs Data Reset

#### Recalibrating counters.

While the counters outputted from the tail private kernel circuit preserve the correct ordering of the items, they do not reflect the actual number of side effects each item entails. This circuit allows the recalibration of counters for public call requests and new contract contexts, ensuring subsequent public kernels can be executed with the correct counter range.

1. For public call requests:

   This circuit validates that for each item at index _i_ in the public call requests within the public inputs:

   1. Its hash must match the hash of the item at index _i_ in the the public call requests within the previous kernel's public inputs.
   2. Its _counter_end_ must be greater than its _counter_start_.
   3. Its _counter_start_ must be greater than the _counter_end_ of the item at index _i + 1_.
   4. If it's the last item, its _counter_start_ must be _1_.

   > It's crucial for the _counter_start_ of the last item to be _1_, as it's assumed in the [tail public kernel circuit](./public-kernel-tail.md#grouping-update-requests) that no update requests have a counter _1_.

2. For new contract contexts:

   For each new contract context _c1_ in the public inputs, pair it with the new contract context _c0_ at the same index in the previous kernel's public inputs. Verify that:

   1. If the counter of _c0_ is greater than the **old** _counter_start_ of the public call request at index _0_, the counter of _c1_ must be the **new** _counter_end_ of the public call request. Skip the remaining steps.
   2. Locate the public call request at index _i_ where the **old** _counter_start_ equals the counter of _c0_.
   3. Verify that the counter of _c1_ is the **new** _counter_start_ of the public call request at index _i_.

### Validating Public Inputs

#### Verifying the accumulated data.

It verifies that the accumulated data matches the one in the previous iteration's public inputs.

#### Verifying the transient accumulated data.

It verifies that the transient accumulated data matches the one in the previous iteration's public inputs, except for the following:

- Public call requests.
- New contract contexts.

Their values are verified in a [previous step](#recalibrating-counters).

#### Verifying the constant data.

It verifies that the constant data matches the one in the previous iteration's public inputs.

## Private Inputs

### Previous Kernel

The data of the previous kernel iteration:

- Proof of the [tail private kernel circuit](./private-kernel-tail.md).
- Public inputs of the proof.
- Verification key of the kernel circuit.
- Membership witness for the verification key.

## Public Inputs

The public inputs of this circuit align with that of the [tail private kernel circuit](./private-kernel-tail.md#public-inputs).
