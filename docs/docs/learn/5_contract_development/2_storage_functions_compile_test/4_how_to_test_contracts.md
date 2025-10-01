---
title: How to Test Contracts
tags: [contracts, tests, testing, noir]
keywords: [tests, testing, noir]
description: Learn how to test your Aztec smart contracts.
---

Perfect! You've learned how to define storage, write functions, and compile your contracts. Now it's time to make sure everything works as expected: **testing**. Writing tests might seem like extra work, but it's actually one of the most valuable skills you'll develop as a smart contract developer. Good tests catch bugs before they reach production, give you confidence when refactoring, and serve as living documentation of how your contract should behave.

For testing Aztec contracts written in Noir, you'll use the **TXE (Test eXecution Environment)** - a lightweight, fast testing framework built specifically for Aztec. Think of the TXE as a simulator that runs your contracts in a simplified environment with mocked components. This makes your tests run quickly and gives you precise control over the testing conditions, perfect for unit testing individual functions and testing contract logic in isolation.

The TXE provides a `TestEnvironment` that mimics the Aztec network locally, allowing you to:

- Deploy contracts instantly without waiting for blocks
- Create test accounts on the fly
- Call private and public functions
- Test authorization patterns like authwits
- Control time and block timestamps

Since the TXE uses mocked components and doesn't run the full rollup circuits, it's ideal for fast iteration during development. However, this also means it has limitations - it can't test complex cross-chain interactions or the full end-to-end flow through the Aztec rollup. For those more comprehensive scenarios, you'll want to use TypeScript-based end-to-end testing with `aztec.js`, which we'll cover in a later section.

For now, let's focus on getting you comfortable with the TXE and writing effective unit tests for your contracts in Noir.

The source of the following guide is [the testing guide](../../../developers/docs/guides/smart_contracts/how_to_test_contracts.md).

---

#include_code test_contracts /docs/docs/developers/docs/guides/smart_contracts/how_to_test_contracts.md raw
