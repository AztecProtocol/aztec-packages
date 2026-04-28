---
title: Aztec Macros
description: Learn about macros available in Aztec.nr for code generation and abstraction.
sidebar_position: 8
tags: [contracts, functions]
---

Aztec.nr provides macros (attributes) that transform your code during compilation to handle the complexities of private execution, proof generation, and state management.

## Quick reference

### Contract

| Attribute | Purpose |
|-----------|---------|
| `#[aztec]` | Marks a module as an Aztec contract |

### Functions

| Attribute | Purpose |
|-----------|---------|
| `#[external("private")]` | Client-side private execution with proofs |
| `#[external("public")]` | Sequencer-side public execution |
| `#[external("utility")]` | Unconstrained queries, not included in transactions |
| `#[internal("private")]` | Private helper, only callable within the same contract |
| `#[internal("public")]` | Public helper, only callable within the same contract |
| `#[view]` | Prevents state modification |
| `#[initializer]` | Contract constructor |
| `#[noinitcheck]` | Callable before contract initialization |
| `#[allow_phase_change]` | Allows for phase change to happen during the function's execution |
| `#[only_self]` | Only callable by the same contract |
| `#[authorize_once]` | Requires authwit authorization with replay protection |

Functions can have multiple attributes (e.g., `#[external("public")]` with `#[view]` and `#[only_self]`).

### Structs

| Attribute | Purpose |
|-----------|---------|
| `#[note]` | Defines a private note type |
| `#[custom_note]` | Note with custom hash/nullifier logic |
| `#[storage]` | Defines contract storage layout |
| `#[storage_no_init]` | Storage with manual slot allocation |

For detailed explanations and examples, see the [Attributes and Macros reference](./functions/attributes.md).

## Further reading

- [Attributes and Macros reference](./functions/attributes.md) - detailed documentation for each macro
- [Inner workings of functions](./functions/function_transforms.md) - how macros transform your code
