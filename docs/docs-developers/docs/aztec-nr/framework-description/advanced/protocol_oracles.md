---
title: Oracle Functions
sidebar_position: 18
tags: [functions, oracles]
description: Learn about oracles in Aztec, which provide external data to smart contracts during execution.
references: ["noir-projects/aztec-nr/aztec/src/oracle/*"]
---

This page goes over what oracles are in Aztec and how they work.

Looking for a hands-on guide? You can learn how to use oracles in a smart contract [here](./how_to_use_capsules.md).

An oracle is something that allows us to get data from the outside world into our contracts. The most widely-known types of oracles in blockchain systems are probably Chainlink price feeds, which allow us to get the price of an asset in USD taking non-blockchain data into account.

While this is one type of oracle, the more general oracle, allows us to get any data into the contract. In the context of oracle functions or oracle calls in Aztec, it can essentially be seen as user-provided arguments, that can be fetched at any point in the circuit, and don't need to be an input parameter.

**Why is this useful? Why don't just pass them as input parameters?**
In the world of EVM, you would just read the values directly from storage and call it a day. However, when we are working with circuits for private execution, this becomes more tricky as you cannot just read the storage directly from your state tree, because there are only commitments (e.g. hashes) there. The pre-images (content) of your commitments need to be provided to the function to prove that you actually allowed to modify them.

If we fetch the notes using an oracle call, we can keep the function signature independent of the underlying data and make it easier to use. A similar idea, applied to the authentication mechanism is used for the Authentication Witnesses that allow us to have a single function signature for any wallet implementation, see [AuthWit](../authentication_witnesses.md) for more information on this.

Oracles introduce **non-determinism** into a circuit, and thus are `unconstrained`. It is important that any information that is injected into a circuit through an oracle is later constrained for correctness. Otherwise, the circuit will be **under-constrained** and potentially insecure!

`Aztec.nr` has a [module dedicated to its oracles](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/oracle/index.html) where you can browse the full list.

## Inbuilt oracles

- [`debug_log`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/protocol/logging/fn.debug_log) - Provides debug functions that can be used to log information to the console. Read more about debugging [here](../../debugging.md).
- [`auth_witness`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/oracle/auth_witness/index.html) - Provides a way to fetch the authentication witness for a given address. This is useful when building account contracts to support approve-like functionality.
- [`get_l1_to_l2_membership_witness`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/oracle/get_l1_to_l2_membership_witness/index.html) - Returns the leaf index and sibling path for an L1 to L2 message, used to prove message existence in cross-chain applications like token bridges.
- [`notes`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/oracle/notes/index.html) - Provides functions related to notes, such as fetching notes from storage, used behind the scenes for value notes and other pre-built note implementations.
- [`logs`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/oracle/logs/index.html) - Provides functions to log encrypted and unencrypted data.

Find a full list [on GitHub](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/aztec-nr/aztec/src/oracle).

Please note that it is **not** possible to write a custom oracle for your dapp. Oracles are implemented in the PXE, so all users of your dapp would have to use a PXE with your custom oracle included. If you want to inject some arbitrary data that does not have a dedicated oracle, you can use [capsules](./how_to_use_capsules.md).
