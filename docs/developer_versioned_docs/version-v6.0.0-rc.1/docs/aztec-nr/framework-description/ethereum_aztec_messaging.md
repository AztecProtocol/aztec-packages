---
title: Ethereum<>Aztec Messaging
tags: [contracts, portals]
sidebar_position: 12
description: Send messages and data between L1 and L2 contracts using portal contracts and cross-chain messaging.
references: ["docs/examples/solidity/example_swap/ExampleTokenPortal.sol", "noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr"]
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

```solidity title="deposit_to_aztec_public" showLineNumbers 
/// @notice Deposit tokens and send L1->L2 message for public minting on Aztec
function depositToAztecPublic(bytes32 _to, uint256 _amount, bytes32 _secretHash)
    external
    returns (bytes32, uint256)
{
    DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2Bridge, rollupVersion);

    bytes32 contentHash =
        Hash.sha256ToField(abi.encodeWithSignature("mint_to_public(bytes32,uint256)", _to, _amount));

    underlying.safeTransferFrom(msg.sender, address(this), _amount);

    return inbox.sendL2Message(actor, contentHash, _secretHash);
}
```
> <sup><sub><a href="https://github.com/aztec-labs-eng/aztec-node/blob/v6.0.0-rc.1/docs/examples/solidity/example_swap/ExampleTokenPortal.sol#L43-L59" target="_blank" rel="noopener noreferrer">Source code: docs/examples/solidity/example_swap/ExampleTokenPortal.sol#L43-L59</a></sub></sup>


:::note Message availability
L1 to L2 messages are not available immediately. The proposer batches messages from the Inbox and includes them in the next L2 block. You must wait for this before consuming the message on L2.
:::

### Consume the message on L2

Call `consume_l1_to_l2_message` on the context. The `content` must match the hash sent from L1, and the `secret` must be the pre-image of the `secretHash`. Consuming a message emits a nullifier to prevent double-spending.

The content hash must be computed identically on both L1 and L2. Create a shared library for your content hash functions—see [`token_portal_content_hash_lib`](https://github.com/aztec-labs-eng/aztec-node/tree/v6.0.0-rc.1/noir-projects/noir-contracts/contracts/libs/token_portal_content_hash_lib) for an example.

```rust title="claim_public" showLineNumbers 
// Consumes a L1->L2 message and calls the token contract to mint the appropriate amount publicly
#[external("public")]
fn claim_public(to: AztecAddress, amount: u128, secret: Field, message_leaf_index: Field) {
    let content_hash = get_mint_to_public_content_hash(to, amount);

    let config = self.storage.config.read();

    // Consume message and emit nullifier
    self.context.consume_l1_to_l2_message(content_hash, [secret], config.portal, message_leaf_index);

    // Mint tokens
    self.call(Token::at(config.token).mint_to_public(to, amount));
}
```
> <sup><sub><a href="https://github.com/aztec-labs-eng/aztec-node/blob/v6.0.0-rc.1/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L63-L77" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L63-L77</a></sub></sup>


This function works in both public and private contexts.

## L2 to L1 messaging

### Send a message from L2

Call `message_portal` on the context to send messages to your L1 portal:

```rust title="exit_to_l1_public" showLineNumbers 
// Burns the appropriate amount of tokens and creates a L2 to L1 withdraw message publicly
// Requires `msg.sender` to give approval to the bridge to burn tokens on their behalf using witness signatures
#[external("public")]
fn exit_to_l1_public(
    recipient: EthAddress, // ethereum address to withdraw to
    amount: u128,
    caller_on_l1: EthAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can
    // call)
    authwit_nonce: Field, // nonce used in the approval message by `msg.sender` to let bridge burn their tokens on
    // L2
) {
    let config = self.storage.config.read();

    // Send an L2 to L1 message
    let content = get_withdraw_content_hash(recipient, amount, caller_on_l1);
    self.context.message_portal(config.portal, content);

    // Burn tokens
    self.call(Token::at(config.token).burn_public(self.msg_sender(), amount, authwit_nonce));
}
```
> <sup><sub><a href="https://github.com/aztec-labs-eng/aztec-node/blob/v6.0.0-rc.1/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L79-L100" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L79-L100</a></sub></sup>


This function works in both public and private contexts.

### Consume the message on L1

Use the `Outbox` contract to consume L2 messages.

:::note Message availability
L2 to L1 messages are only available after the epoch proof is submitted to L1. Since multiple L2 blocks fit within an epoch, there may be a delay—especially if the message was sent near the start of an epoch.
:::

```solidity title="withdraw" showLineNumbers 
/// @notice Withdraw tokens after consuming an L2->L1 message.
/// @param _numCheckpointsInEpoch The partial-proof depth (1-indexed) the witness was built against.
function withdraw(
    address _recipient,
    uint256 _amount,
    Epoch _epoch,
    uint256 _numCheckpointsInEpoch,
    uint256 _leafIndex,
    bytes32[] calldata _path
) external {
    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
        sender: DataStructures.L2Actor(l2Bridge, rollupVersion),
        recipient: DataStructures.L1Actor(address(this), block.chainid),
        content: Hash.sha256ToField(
            abi.encodeWithSignature("withdraw(address,uint256,address)", _recipient, _amount, msg.sender)
        )
    });

    outbox.consume(message, _epoch, _numCheckpointsInEpoch, _leafIndex, _path);

    underlying.safeTransfer(_recipient, _amount);
}
```
> <sup><sub><a href="https://github.com/aztec-labs-eng/aztec-node/blob/v6.0.0-rc.1/docs/examples/solidity/example_swap/ExampleTokenPortal.sol#L72-L95" target="_blank" rel="noopener noreferrer">Source code: docs/examples/solidity/example_swap/ExampleTokenPortal.sol#L72-L95</a></sub></sup>


:::info Getting the membership witness

Compute the witness for the L2 to L1 message in TypeScript:

```ts
import { computeL2ToL1MessageHash } from "@aztec-labs/stdlib/hash";

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

- [Token Portal (L1)](https://github.com/aztec-labs-eng/aztec-node/blob/v6.0.0-rc.1/docs/examples/solidity/example_swap/ExampleTokenPortal.sol)
- [Token Bridge (L2)](https://github.com/aztec-labs-eng/aztec-node/blob/v6.0.0-rc.1/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr)

## Next steps

Follow the [token bridge tutorial](../../tutorials/js_tutorials/token_bridge.md) for a complete implementation example.
