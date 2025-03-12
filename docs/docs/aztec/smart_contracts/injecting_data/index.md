---
title: Injecting Data
tags: [functions, oracles, capsules]
---

There are multiple ways to inject data into smart contracts.

1. **Oracles** - fetching data from the outside world
2. **Authwits (Authentication Witnesses)** - authorizing an arbitrary action (or piece of data)
3. **Capsules** - local data storage in the PXE

## Oracles

In the world of EVM, you can read data directly from storage. However, when we are working with circuits for private execution, this becomes more tricky as you cannot just read the storage directly from your state tree, because there are only commitments (e.g. hashes) there. The pre-images (content) of your commitments need to be provided to the function to prove that you actually allowed to modify them.

If we fetch the notes using an oracle call, we can keep the function signature independent of the underlying data and make it easier to use. See [oracles](./oracles.md) for more information.

## Authentication Witnesses (authwit)

The same mechanism used in oracles is also used for the Authentication Witnesses that allow us to have a single function signature for any wallet implementation. See [AuthWit](../../concepts/advanced/authwit.md) for more information on this.

## Capsules

Capsules are used to store data in the PXE and inject this data into smart contracts. They can be useful for arbitrary data that does not have a dedicated oracle.

You can learn more about using capsules in contracts in the [reference docs](../../../developers/reference/smart_contract_reference/aztec-nr/aztec/oracle/capsules.md)




