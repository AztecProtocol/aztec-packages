---
title: ACIR Simulator
---

The ACIR Simulator is responsible for simulation Aztec smart contract function execution. This component helps with correct execution of Aztec transactions.

Simulating a function implies generating the partial witness and the public inputs of the function, as well as collecting all the data (such as created notes or nullifiers, or state changes) that are necessary for components upstream.

## Simulating functions

It simulates private, public and utility functions.
For more details on these function types see [Aztec Call Types](../pxe/acir_simulator.md#aztec-call-types)
