---
title: Using the Capsules
sidebar_position: 5
tags: [functions, oracles]
---

`popCapsule` is used for passing arbitrary data. We have not yet included this in Aztec.nr, so it is a bit more complex than the other oracles. You can follow this how-to:

### 1. Import capsules into your smart contract

If it lies in the same directory as your smart contract, you can import it like this:

#include_code import_capsules noir-projects/noir-contracts/contracts/contract_class_registerer_contract/src/main.nr rust

### 2. Use it as any other oracle

Now it becomes a regular oracle you can call like this:

#include_code load_capsule noir-projects/noir-contracts/contracts/contract_class_registerer_contract/src/main.nr rust
