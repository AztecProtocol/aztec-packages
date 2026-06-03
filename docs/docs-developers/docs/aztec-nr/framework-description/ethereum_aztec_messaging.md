---
title: Ethereum<>Aztec Messaging
tags: [contracts, portals]
sidebar_position: 12
description: Send messages and data between L1 and L2 contracts using portal contracts and cross-chain messaging.
references: ["l1-contracts/test/portals/TokenPortal.sol", "noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr"]
---

This guide covers cross-chain communication between Ethereum (L1) and Aztec (L2) using portal contracts.

Aztec uses an Inbox/Outbox pattern for cross-chain messaging. Messages sent from L1 are inserted into the `Inbox` contract and later consumed on L2. Messages sent from L2 are inserted into the `Outbox` contract and later consumed on L1. Portal contracts are L1 contracts that facilitate this communication for your application.

## Prerequisites

- An Aztec contract project with `aztec-nr` dependency
- Access to Ethereum development environment for L1 contracts
- Deployed portal contract on L1 (see [token bridge tutorial](../../tutorials/js_tutorials/token_bridge.md))

## L1 to L2 messaging

### Send a message from L1

Use the `Inbox` contract's `sendL2Message` function:

| Parameter     | Type      | Description                                             |
| ------------- | --------- | ------------------------------------------------------- |
| `_recipient`  | `L2Actor` | L2 contract address and rollup version                  |
| `_content`    | `bytes32` | Hash of message content (use `Hash.sha256ToField`)      |
| `_secretHash` | `bytes32` | Hash of secret for message consumption                  |

#include_code deposit_public l1-contracts/test/portals/TokenPortal.sol solidity

:::note Message availability
L1 to L2 messages are not available immediately. The proposer batches messages from the Inbox and includes them in the next L2 block. You must wait for this before consuming the message on L2.
:::

### Consume the message on L2

Call `consume_l1_to_l2_message` on the context. The `content` must match the hash sent from L1, and the `secret` must be the pre-image of the `secretHash`. Consuming a message emits a nullifier to prevent double-spending.

The content hash must be computed identically on both L1 and L2. Create a shared library for your content hash functions—see [`token_portal_content_hash_lib`](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/app/token_portal_content_hash_lib) for an example.

#include_code claim_public noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr rust

This function works in both public and private contexts.

## L2 to L1 messaging

### Send a message from L2

Call `message_portal` on the context to send messages to your L1 portal:

#include_code exit_to_l1_public noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr rust

This function works in both public and private contexts.

### Consume the message on L1

Use the `Outbox` contract to consume L2 messages.

:::note Message availability
L2 to L1 messages are only available after the epoch proof is submitted to L1. Since multiple L2 blocks fit within an epoch, there may be a delay—especially if the message was sent near the start of an epoch.
:::

#include_code token_portal_withdraw l1-contracts/test/portals/TokenPortal.sol solidity

:::info Getting the membership witness

Compute the witness for the L2 to L1 message in TypeScript:

```ts
import { computeL2ToL1MessageHash } from "@aztec/stdlib/hash";

const l2ToL1Message = computeL2ToL1MessageHash({
  l2Sender: l2BridgeAddress,
  l1Recipient: EthAddress.fromString(portalAddress),
  content: withdrawContentHash,
  rollupVersion: new Fr(version),
  chainId: new Fr(chainId),
});

const witness = await aztecNode.getL2ToL1MembershipWitness(
  txReceipt.txHash,
  l2ToL1Message
);

// Use witness.leafIndex and witness.siblingPath for the L1 consume call
```

:::

## Example implementations

- [Token Portal (L1)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/l1-contracts/test/portals/TokenPortal.sol)
- [Token Bridge (L2)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr)

## Next steps

Follow the [token bridge tutorial](../../tutorials/js_tutorials/token_bridge.md) for a complete implementation example.
