---
title: Defining Functions
sidebar_position: 3
tags: [functions]
description: Overview of Aztec contract functions, including private, public, and utility function types.
---

Functions serve as the building blocks of smart contracts. Functions can be either **public**, ie they are publicly available for anyone to see and can directly interact with public state, or **private**, meaning they are executed completely client-side in the [PXE](../../../concepts/pxe/index.md). Read more about how private functions work [here](./attributes.md#private-functions-private).

Currently, any function is "mutable" in the sense that it might alter state. However, we also support static calls, similarly to EVM. A static call is essentially a call that does not alter state (it keeps state static).

## Initializer functions

Smart contracts may have one, or many, initializer functions which are called when the contract is deployed.

Initializers are regular functions that set an "initialized" flag (a nullifier) for the contract. A contract can only be initialized once, and contract functions can only be called after the contract has been initialized, much like a constructor. However, if a contract defines no initializers, it can be called at any time. Additionally, you can define as many initializer functions in a contract as you want, both private and public.

## Oracles

There are also special oracle functions, which can get data from outside of the smart contract. In the context of Aztec, oracles are often used to get user-provided inputs.

## Learn more about functions

- [How function visibility works in Aztec](./visibility.md)
- How to write an [initializer function](../../../guides/smart_contracts/define_functions.md#initializer-functions)
- [Oracles](../oracles/index.md) and how Aztec smart contracts might use them
- [How functions work under the hood](./attributes.md)

Find a function macros reference [here](../../../reference/smart_contract_reference/macros.md)
