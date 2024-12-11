---
title: Aztec macros
sidebar_position: 6
tags: [contracts, functions]
---

## All Aztec macros

In addition to the function macros in Noir, Aztec also has its own macros for specific functions. An Aztec contract function can be annotated with more than 1 macro.
It is also worth mentioning Noir's `unconstrained` function type [here (Noir docs page)](https://noir-lang.org/docs/noir/concepts/unconstrained/).

- `#[aztec]` - Defines a contract, placed above `contract ContractName{}`
- `#[public]` or `#[private]` - Whether the function is to be executed from a public or private context (see Further Reading)
- `#[initializer]` - If one or more functions are marked as an initializer, then one of them must be called before any non-initializer functions
- `#[noinitcheck]` - The function is able to be called before an initializer (if one exists)
- `#[view]` - Makes calls to the function static (see also [Static calls in the protocol spec](../../../protocol-specs/calls/static-calls.md))
- `#[internal]` - Function can only be called from within the contract
- `#[note]` - Creates a custom note
- `#[storage]` - Defines contract storage

## Further reading
[How do Aztec macros work?](../../../aztec/smart_contracts/functions/function_transforms.md)
