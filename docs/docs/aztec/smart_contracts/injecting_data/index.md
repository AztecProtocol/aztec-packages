---
title: Injecting Data
tags: [functions, oracles, capsules]
---

There are multiple ways to inject data into smart contracts.

1. **Oracles** - fetching data from the outside world
2. **Authwits (Authentication Witnesses)** - authorizing an arbitrary action (or piece of data)
3. **Capsules** - local data storage in the PXE

## Oracles

An oracle is something that allows us to get data from the outside world into our contracts. Aztec has some inbuilt oracles that allow developers to access cross-chain messages, private logs, data about notes, and others. You can learn more about them [here](./oracles.md).

## Authentication Witnesses (authwit)

The same mechanism used in oracles is also used for the Authentication Witnesses that allow us to have a single function signature for any wallet implementation. See [AuthWit](../../concepts/advanced/authwit.md) for more information on this.

## Capsules

Capsules are used to store contract-scoped data in the PXE and inject this data into smart contracts. They can be useful for arbitrary data that does not have a dedicated oracle.

You can learn more about using capsules in contracts in the [reference docs](../../../developers/reference/smart_contract_reference/aztec-nr/aztec/oracle/capsules.md)
