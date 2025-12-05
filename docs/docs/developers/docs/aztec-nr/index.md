---
title: Overview
sidebar_position: 0
tags: [aztec.nr, smart contracts]
description: Comprehensive guide to writing smart contracts for the Aztec network using Noir.
---

import DocCardList from '@theme/DocCardList';

Aztec.nr is a Noir framework used to develop and test Aztec smart contracts. It contains both high-level abstractions (state variables, messages) and low-level protocol primitives, providing granular control to developers if they want custom contracts.

## Motivation

Noir _can_ be used to write circuits, but Aztec contracts are more complex than this. They include multiple external functions, each of a different type: circuits for private functions, AVM bytecode for public functions, and brillig bytecode for utility functions. The circuits for private functions also need to interact with the protocol's kernel circuits in specific ways, so manually writing them, and then combining everything into a contract artifact is involved work. Aztec.nr takes care of all of this heavy lifting and makes writing contracts as simple as marking functions with the corresponding attributes e.g. `#[external(private)]`.

It allows safe and easy implementation of well understood design patterns, such as the multiple kinds of private state variables, meaning developers don't need to understand the low-levels of how the protocol works. These features are optional, however, advanced developers are not prevented from building their own custom solutions.

- Install [Aztec Local Network and Tooling](../../getting_started_on_local_network.md)
- Install the [Noir LSP](../aztec-nr/installation.md) for your editor.

- Make it hard to shoot yourself in the foot by making it clear when something is unsafe.
- Dangerous actions should be easy to spot. e.g. ignoring return values or calling functions with the `_unsafe` prefix.
- This is achieved by having rails that intentionally trigger a developer's "WTF?" response, to ensure they understand what they're doing.

A good example of this is writing to private state variables. These functions return a `NoteMessagePendingDelivery` struct, which results in a compiler error unless used. This is because writing to private state also requires sending an encrypted message with the new state to the people that need to access it - otherwise, because it is private, they will not even know the state changed.


Update your `main.nr` contract file to use the Aztec.nr macros for writing contracts.

#include_code setup /docs/examples/contracts/counter_contract/src/main.nr rust

and import dependencies from the Aztec.nr library.

#include_code imports /docs/examples/contracts/counter_contract/src/main.nr rust

:::info

You can see a complete example of a simple counter contract written with Aztec.nr [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/docs/examples/contracts/counter_contract/src/main.nr).

:::

2. [Profile](./framework-description/advanced/how_to_profile_transactions.md) the private functions in your contract to get
   a sense of how long generating client side proofs will take
3. Write unit tests [directly in Noir](how_to_test_contracts.md) and end-to-end
   tests [with TypeScript](../aztec-js/how_to_test.md)
4. [Compile](how_to_compile_contract.md) your contract
5. [Deploy](../aztec-js/how_to_deploy_contract.md) your contract with Aztec.js

## Section Contents

<DocCardList />
