---
title: Aztec macros
description: Learn about macros available in Aztec.nr for code generation and abstraction.
sidebar_position: 8
tags: [contracts, functions]
---

## All Aztec macros

In addition to the function macros in Noir, Aztec also has its own macros for specific functions. An Aztec contract function can be annotated with more than 1 macro.
It is also worth mentioning Noir's `unconstrained` function type [here (Noir docs page)](https://noir-lang.org/docs/noir/concepts/unconstrained/).

- `#[aztec]` - Defines a contract, placed above `contract ContractName{}`
- `#[external("...")]` - Whether the function is to be callable from outside the contract. There are 3 types of external functions: `#[external("public")]`, `#[external("private")]` or `#[external("utility")]` - The type of external defines whether the function is to be executed from a public, private or utility context (see Further Reading)
- `#[initializer]` - If one or more functions are marked as an initializer, then one of them must be called before any non-initializer functions
- `#[noinitcheck]` - The function is able to be called before an initializer (if one exists)
- `#[view]` - Makes calls to the function static
- `#[only_self]` - Available only for `external` functions - any external caller except the current contract is rejected.
- `#[internal]` - NOT YET IMPLEMENTED - Function can only be called from within the contract and the call itself is inlined (e.g. akin to EVM's JUMP and not EVM's CALL)
- `#[note]` - Creates a custom note
- `#[storage]` - Defines contract storage

## Further reading

[How do Aztec macros work?](../../aztec-nr/framework-description/functions/function_transforms.md)
