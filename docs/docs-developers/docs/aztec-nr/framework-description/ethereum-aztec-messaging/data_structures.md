---
title: Data Structures
description: Learn about the data structures used in Aztec portals for L1-L2 communication.
references: ["l1-contracts/src/core/libraries/DataStructures.sol"]
---

This page documents the Solidity structs used for L1-L2 message passing in the Aztec protocol.

**Source**: [DataStructures.sol](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/l1-contracts/src/core/libraries/DataStructures.sol)

## `L1Actor`

An entity on L1, specifying the address and the chainId. Used when specifying a sender or recipient on L1.

#include_code l1_actor l1-contracts/src/core/libraries/DataStructures.sol solidity

## `L2Actor`

An entity on L2, specifying the Aztec address and the protocol version. Used when specifying a sender or recipient on L2.

#include_code l2_actor l1-contracts/src/core/libraries/DataStructures.sol solidity

## `L1ToL2Msg`

A message sent from L1 to L2. The `secretHash` field contains the hash of a secret pre-image that must be known to consume the message on L2. Use [`computeSecretHash`](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/stdlib/src/hash/hash.ts) to compute it from a secret.

#include_code l1_to_l2_msg l1-contracts/src/core/libraries/DataStructures.sol solidity

## `L2ToL1Msg`

A message sent from L2 to L1.

#include_code l2_to_l1_msg l1-contracts/src/core/libraries/DataStructures.sol solidity

## See also

- [Inbox](./inbox.md) - L1 contract for sending messages to L2
- [Outbox](./outbox.md) - L1 contract for consuming messages from L2
- [Portal messaging overview](./index.md) - How L1-L2 messaging works
