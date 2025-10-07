---
title: Communicating Cross-Chain
tags: [contracts, portals]
sidebar_position: 9
description: Send messages and data between L1 and L2 contracts using portal contracts and cross-chain messaging.
---

This guide shows you how to implement cross-chain communication between Ethereum (L1) and Aztec (L2) contracts using portal contracts.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Understanding of Aztec L1/L2 architecture
- Access to Ethereum development environment for L1 contracts
- Deployed portal contract on L1 (see [token bridge tutorial](../../tutorials/js_tutorials/token_bridge.md))

## Send messages from L1 to L2

### Send a message from your L1 portal contract

Use the `Inbox` contract to send messages from L1 to L2. Call `sendL2Message` with these parameters:

| Parameter   | Type     | Description |
|-------------|----------|-------------|
| `actor` | `L2Actor` | Your L2 contract address and rollup version |
| `contentHash` | `bytes32` | Hash of your message content (use `Hash.sha256ToField`) |
| `secretHash` | `bytes32` | Hash of a secret for message consumption |

In your Solidity contract:

```solidity
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";

// ... initialize inbox, get rollupVersion from rollup contract ...

DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2ContractAddress, rollupVersion);

// Hash your message content with a unique function signature
bytes32 contentHash = Hash.sha256ToField(
    abi.encodeWithSignature("your_action_name(uint256,address)", param1, param2)
);

// Send the message
(bytes32 key, uint256 index) = inbox.sendL2Message(actor, contentHash, secretHash);
```

### Consume the message in your L2 contract

To consume a message coming from L1, use the `consume_l1_to_l2_message` function within the context:

- The `content_hash` must match the hash that was sent from L1
- The `secret` is the pre-image of the `secretHash` sent from L1
- The `sender` is the L1 portal contract address
- The `message_leaf_index` helps the RPC find the correct message
- If the content or secret doesn't match, the transaction will revert
- "Consuming" a message pushes a nullifier to prevent double-spending

```rust
#[public]
fn consume_message_from_l1(
    secret: Field,
    message_leaf_index: Field,
    // your function parameters
) {
    // Recreate the same content hash as on L1
    let content_hash = /* compute your content hash */;

    // Consume the L1 message
    context.consume_l1_to_l2_message(
        content_hash,
        secret,
        portal_address, // Your L1 portal contract address
        message_leaf_index
    );

    // Execute your contract logic here
}
```

## Send messages from L2 to L1

### Send a message from your L2 contract

Use `message_portal` in your `context` to send messages from L2 to L1:

```rust
#[public]
fn send_message_to_l1(
    // your function parameters
) {
    // Note: This can be called from both public and private functions
    // Create your message content (must fit in a single Field)
    let content = /* compute your content hash */;

    // Send message to L1 portal
    context.message_portal(portal_address, content);
}
```

### Consume the message in your L1 portal

Use the `Outbox` to consume L2 messages on L1:

```solidity
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";

function consumeMessageFromL2(
    // your parameters
    uint256 _l2BlockNumber,
    uint256 _leafIndex,
    bytes32[] calldata _path
) external {
    // Recreate the message structure
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
        sender: DataStructures.L2Actor(l2ContractAddress, rollupVersion),
        recipient: DataStructures.L1Actor(address(this), block.chainid),
        content: Hash.sha256ToField(
            abi.encodeWithSignature(
                "your_action_name(address,uint256,address)",
                param1, param2, param3
            )
        )
    });

    // Consume the message
    outbox.consume(message, _l2BlockNumber, _leafIndex, _path);

    // Execute your L1 logic here
}
```

:::info

The `_leafIndex` and `_path` parameters are merkle tree proofs needed to verify the message exists. Get them using JavaScript:

```ts
import { computeL2ToL1MessageHash } from '@aztec/stdlib/hash';

// Compute the message hash
const l2ToL1Message = computeL2ToL1MessageHash({
  l2Sender: l2ContractAddress,
  l1Recipient: EthAddress.fromString(portalAddress),
  content: messageContent,
  rollupVersion: new Fr(version),
  chainId: new Fr(chainId),
});

// Get the merkle proof
const [leafIndex, siblingPath] = await pxe.getL2ToL1MembershipWitness(
  await pxe.getBlockNumber(),
  l2ToL1Message
);
```

:::

## Best practices

### Structure messages properly

Use function signatures to prevent message misinterpretation:

```solidity
// ❌ Ambiguous format
bytes memory message = abi.encode(_value, _contract, _recipient);

// ✅ Clear function signature
bytes memory message = abi.encodeWithSignature(
  "execute_action(uint256,address,address)",
  _value, _contract, _recipient
);
```

### Use designated callers

Control message execution order with designated callers:

```solidity
bytes memory message = abi.encodeWithSignature(
  "execute_action(uint256,address,address)",
  _value, _recipient,
  _withCaller ? msg.sender : address(0)
);
```

## Example implementations

- [Token Portal (L1)](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251007/l1-contracts/test/portals/TokenPortal.sol)
- [Token Bridge (L2)](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251007/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr)

## Next steps

Follow the [cross-chain messaging tutorial](../../tutorials/js_tutorials/token_bridge.md) for a complete implementation example.
