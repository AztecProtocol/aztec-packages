---
title: ACIR Simulator
---

The ACIR Simulator is responsible for simulation Aztec smart contract function execution. This component helps with correct execution of Aztec transactions.

Simulating a function implies generating the partial witness and the public inputs of the function, as well as collecting all the data (such as created notes or nullifiers, or state changes) that are necessary for components upstream.

## Simulating functions

It simulates all [three types of contract functions](../call_types.md#aztec-call-types):

### Private Functions

Private functions are simulated and proved client-side, and verified client-side in the private kernel circuit.

They are run with the assistance of a DB oracle that provides any private data requested by the function. You can read more about oracle functions in the smart contract section [here](../../smart_contracts/oracles/index.md).

Private functions can call other private functions and can request to call a public function. The public function execution will be performed by the sequencer asynchronously, so private functions don't have direct access to the return values of public functions.

### Public Functions

Public functions are simulated and proved on the sequencer side, and verified by the [public kernel circuit](../../concepts/advanced/circuits/kernels/public_kernel.md).

They are run with the assistance of an oracle that provides any value read from the public state tree.

Public functions can call other public functions as well as private functions. Public function composability can happen atomically, but public to private function calls happen asynchronously (the private function call must happen in a future block).

### Utility Functions

Utility functions are used to extract useful data for users, such as the user balance. They are not proven, and are simulated client-side.

They are run with the assistance of an [oracle resolver](https://noir-lang.org/docs/explainers/explainer-oracle) that provides any private data requested by the function.

At the moment, utility functions cannot call any other function. It is not possible for them to call private or public functions, but it is on the roadmap to allow them to call other utility functions.
