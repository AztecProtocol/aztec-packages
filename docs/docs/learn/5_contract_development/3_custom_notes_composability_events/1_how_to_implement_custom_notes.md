---
title: Implementing Custom Notes
tags: [contracts, notes, privacy, smart-contracts]
description: Learn how to create custom note types for specialized private data storage in your Aztec smart contracts.
---

Now that you understand storage and functions, let's explore one of Aztec's most powerful privacy features: **custom notes**. You've already seen notes briefly mentioned when working with `PrivateSet` storage - now it's time to learn how to create your own note types tailored to your specific use case.

Notes are the fundamental building blocks of private state in Aztec. Think of them as private data packets that only specific people can see and spend. While Aztec provides built-in note types like `ValueNote` for simple cases, you'll often want to create custom notes to store structured data - like a game card with multiple attributes, a private order with multiple fields, or any complex private data structure.

Understanding custom notes is crucial because they give you complete control over how your private data is structured, stored, and accessed. This guide will show you how to define custom notes, why certain fields are required for privacy and security, and how to use them effectively in your contracts.

The source of the following guide is [the implement custom notes guide](../../../developers/docs/guides/smart_contracts/how_to_implement_custom_notes).

---

#include_code how_to_implement_custom_notes /docs/docs/developers/docs/guides/smart_contracts/how_to_implement_custom_notes.md raw