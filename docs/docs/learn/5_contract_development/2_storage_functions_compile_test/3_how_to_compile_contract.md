---
title: How to Compile Contracts
tags: [contracts, learning journey]
description: Learn how to compile your Aztec smart contracts.
---

Excellent! You now know how to define storage and functions - the two core components of any Aztec smart contract. But before you can deploy and use your contract, there's one crucial step: **compilation**. This is where your human-readable Noir code gets transformed into artifacts that the Aztec network can understand and execute.

Think of compilation as translating your contract from a language you understand (Noir) into a language the blockchain understands. But it's more than just translation - for Aztec contracts, compilation also generates the cryptographic verification keys needed for private functions and creates type-safe interfaces that make it easy to interact with your contract from other contracts or applications.

This might seem like a purely technical step, but understanding compilation will help you debug issues, optimize your contracts, and work more effectively with the Aztec toolchain. Let's walk through how to compile your contracts and what happens behind the scenes.

The source of the following guide is [the compile contract guide](../../../developers/docs/guides/smart_contracts/how_to_compile_contract).

---

#include_code compile_contracts /docs/docs/developers/docs/guides/smart_contracts/how_to_compile_contract.md raw
