---
title: Declaring Contract Storage
tags: [contracts, storage, data-types, smart-contracts]
description: Define and manage storage state in your Aztec smart contracts using various storage types.
source: "developers/docs/guides/smart_contracts/how_to_define_storage.md"
---

Now that you understand the overall structure of Aztec contracts from the previous section, let's dive deeper into one of the most important aspects: **storage**. Remember when we briefly covered storage types like `PublicMutable`, `PrivateSet`, and `Map`? This is where we'll explore them in detail and learn how to use them effectively.

Storage is where your contract keeps its persistent state - the data that survives between function calls and transactions. In Aztec, storage is particularly interesting because you have choices about visibility and privacy that don't exist in traditional blockchain platforms. You can keep some data completely private, make other data publicly visible, or even mix both approaches in the same contract.

Think of this guide as your detailed reference for declaring and working with storage. We'll show you the exact syntax, all the available storage types, and how to use them in your contracts. By the end of this section, you'll know exactly how to structure your contract's state to meet your privacy and functionality requirements.

The following guide shows you how to declare storage and use various storage types provided by Aztec.nr for managing contract state.

The source of the following guide is [the define storage guide](../../../developers/docs/guides/smart_contracts/how_to_define_storage).

---

#include_code define_storage /docs/docs/developers/docs/guides/smart_contracts/how_to_define_storage.md raw
