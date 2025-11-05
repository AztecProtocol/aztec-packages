---
title: Overview
sidebar_position: 0
tags: [aztec.nr, smart contracts]
description: Comprehensive guide to writing smart contracts for the Aztec network using Noir.
---

Aztec.nr is a Noir framework used to develop and test Aztec smart contracts. It contains both high-level abstractions (state variables, messages) and low-level protocol primitives, providing granular control to developers if they want custom contracts.

## Motivation

Noir _can_ be used to write circuits, but Aztec contracts are more complex than this. They include multiple external functions, each of a different type: circuits for private functions, AVM bytecode for public functions, and brillig bytecode for utility functions. The circuits for private functions are also need to interact with the protocol's kernel circuits in specific ways, so manually writing them, and then combining everything into a contract artifact is involved work. Aztec.nr takes care of all of this heavy lifting and makes writing contracts as simple as marking functions with the corresponding attributes e.g. `#[external(private)]`.

It allows safe and easy implementation of well understood design patterns, such as the multiple kinds of private state variables, meaning developers don't need to understand the low-levels of how the protocol works. These features are optional, however, advanced developers are not prevented from building their own custom solutions.

## Design principles

- Make it hard to shoot yourself in the foot by making it clear when something is unsafe.
- Dangerous actions should be easy to spot. e.g. ignoring return values or calling functions with the `_unsafe` prefix.
- This is achieved by having rails that intentionally trigger a developer's "WTF?" response, to ensure they understand what they're doing.

A good example of this is writing to private state variables. These functions return a `NoteMessagePendingDelivery` struct, which results in a compiler error unless used. This is because writing to private state also requires sending an encrypted message with the new state to the people that need to access it - otherwise, because it is private, they will not even know the state changed.

```
storage.votes.insert(new_vote); // compiler error - unused NoteMessagePendingDelivery return value
storage.votes.insert(new_vote).deliver(vote_counter); // the vote counter account will now be notified of the new vote
```
