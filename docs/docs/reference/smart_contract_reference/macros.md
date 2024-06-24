---
title: Aztec macros
sidebar_position: 6
---

## All Aztec macros

In addition to the function macros in Noir, Aztec also has its own macros for specific functions. An Aztec contract function can be annotated with more than 1 macro.
It is also worth mentioning Noir's `unconstrained` function type [here](https://noir-lang.org/docs/noir/concepts/unconstrained/).

- `#[aztec(public)]` or `#[aztec(private)]` - Whether the function is public or private (more in next section)
- `#[aztec(initializer)]` - If one or more functions are marked as an initializer, then one of them must be called before any non-initilizer functions
- `#[aztec(noinitcheck)]` - The function is able to be called before an initializer (if one exists)
- `#[aztec(view)]` - Makes calls to the function static (see also [Static calls](../../../../protocol-specs/calls/static-calls))
- `#[aztec(internal)]` - Function can only be called from within the contract
- `#[aztec(note)]` - Creates a custom note

## Further reading
[What are Aztec macros?](../../aztec/concepts/smart_contracts/functions/function_types_macros.md)
