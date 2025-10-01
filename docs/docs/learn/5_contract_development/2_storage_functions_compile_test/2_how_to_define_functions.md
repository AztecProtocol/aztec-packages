---
title: How to Define Functions
tags: [functions, smart-contracts]
description: Learn how to define functions in your Aztec smart contracts.
---

Great work learning about storage! Now let's explore the other essential building block of smart contracts: **functions**. If storage is where your contract keeps its state, functions are how your contract _does things_ - they're the actions, operations, and behaviors that bring your contract to life.

You've already seen various function types in the Contract Structure section - `#[private]`, `#[public]`, `#[utility]`, `#[view]`, `#[internal]`, and `#[initializer]`. You also understand that these attributes control where and how functions execute. Now it's time to dive into the specifics: how to define each type of function, when to use each one, and how they interact with the storage you just learned about.

This guide will walk you through the syntax and usage of each function type. Think of it as your reference for implementing the behavior of your contracts. By the end, you'll know exactly which function type to reach for based on your privacy requirements, execution environment, and whether you need to modify state or just read it.

The source of the following guide is [the define functions guide](../../../developers/docs/guides/smart_contracts/how_to_define_functions).

---

<!-- This file must have the same name the file that it is importing code from for the url fixer script to work -->

#include_code define_functions /docs/docs/developers/docs/guides/smart_contracts/how_to_define_functions.md raw
