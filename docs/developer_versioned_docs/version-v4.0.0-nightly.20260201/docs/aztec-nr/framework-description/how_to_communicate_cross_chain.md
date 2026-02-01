---
title: Communicating Cross-Chain
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

```solidity title="deposit_public" showLineNumbers 
/**
 * @notice Deposit funds into the portal and adds an L2 message which can only be consumed publicly on Aztec
 * @param _to - The aztec address of the recipient
 * @param _amount - The amount to deposit
 * @param _secretHash - The hash of the secret consumable message. The hash should be 254 bits (so it can fit in a
 * Field element)
 * @return The key of the entry in the Inbox and its leaf index
 */
function depositToAztecPublic(bytes32 _to, uint256 _amount, bytes32 _secretHash)
  external
  returns (bytes32, uint256)
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260201/l1-contracts/test/portals/TokenPortal.sol#L48-L60" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/test/portals/TokenPortal.sol#L48-L60</a></sub></sup>


:::note Message availability
L1 to L2 messages are not available immediately. The proposer batches messages from the Inbox and includes them in the next L2 block. You must wait for this before consuming the message on L2.
:::

### Consume the message on L2

Call `consume_l1_to_l2_message` on the context. The `content` must match the hash sent from L1, and the `secret` must be the pre-image of the `secretHash`. Consuming a message emits a nullifier to prevent double-spending.

The content hash must be computed identically on both L1 and L2. Create a shared library for your content hash functions—see [`token_portal_content_hash_lib`](https://github.com/AztecProtocol/aztec-packages/tree/v4.0.0-nightly.20260201/noir-projects/noir-contracts/contracts/app/token_portal_content_hash_lib) for an example.

```rust title="claim_public" showLineNumbers 
// Consumes a L1->L2 message and calls the token contract to mint the appropriate amount publicly
#[external("public")]
fn claim_public(to: AztecAddress, amount: u128, secret: Field, message_leaf_index: Field) {
    let content_hash = get_mint_to_public_content_hash(to, amount);

    let config = self.storage.config.read();

    // Consume message and emit nullifier
    self.context.consume_l1_to_l2_message(
        content_hash,
        secret,
        config.portal,
        message_leaf_index,
    );

    // Mint tokens
    self.call(Token::at(config.token).mint_to_public(to, amount));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260201/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L50-L69" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L50-L69</a></sub></sup>


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
    caller_on_l1: EthAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
    authwit_nonce: Field, // nonce used in the approval message by `msg.sender` to let bridge burn their tokens on L2
) {
    let config = self.storage.config.read();

    // Send an L2 to L1 message
    let content = get_withdraw_content_hash(recipient, amount, caller_on_l1);
    self.context.message_portal(config.portal, content);

    // Burn tokens
    self.call(Token::at(config.token).burn_public(self.msg_sender(), amount, authwit_nonce));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260201/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L71-L90" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L71-L90</a></sub></sup>


This function works in both public and private contexts.

### Consume the message on L1

Use the `Outbox` contract to consume L2 messages.

:::note Message availability
L2 to L1 messages are only available after the epoch proof is submitted to L1. Since multiple L2 blocks fit within an epoch, there may be a delay—especially if the message was sent near the start of an epoch.
:::

```solidity title="token_portal_withdraw" showLineNumbers 
/**
 * @notice Withdraw funds from the portal
 * @dev Second part of withdraw, must be initiated from L2 first as it will consume a message from outbox
 * @param _recipient - The address to send the funds to
 * @param _amount - The amount to withdraw
 * @param _withCaller - Flag to use `msg.sender` as caller, otherwise address(0)
 * @param _epoch - The epoch the message is in
 * @param _leafIndex - The amount to withdraw
 * @param _path - Flag to use `msg.sender` as caller, otherwise address(0)
 * Must match the caller of the message (specified from L2) to consume it.
 */
function withdraw(
  address _recipient,
  uint256 _amount,
  bool _withCaller,
  Epoch _epoch,
  uint256 _leafIndex,
  bytes32[] calldata _path
) external {
  // The purpose of including the function selector is to make the message unique to that specific call. Note that
  // it has nothing to do with calling the function.
  DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
    sender: DataStructures.L2Actor(l2Bridge, rollupVersion),
    recipient: DataStructures.L1Actor(address(this), block.chainid),
    content: Hash.sha256ToField(
      abi.encodeWithSignature(
        "withdraw(address,uint256,address)", _recipient, _amount, _withCaller ? msg.sender : address(0)
      )
    )
  });

  outbox.consume(message, _epoch, _leafIndex, _path);

  underlying.safeTransfer(_recipient, _amount);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260201/l1-contracts/test/portals/TokenPortal.sol#L114-L150" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/test/portals/TokenPortal.sol#L114-L150</a></sub></sup>


:::info Getting the membership witness

Compute the witness for the L2 to L1 message in TypeScript:

```ts
import { computeL2ToL1MembershipWitness } from "@aztec/stdlib/messaging";
import { computeL2ToL1MessageHash } from "@aztec/stdlib/hash";

const l2ToL1Message = computeL2ToL1MessageHash({
  l2Sender: l2BridgeAddress,
  l1Recipient: EthAddress.fromString(portalAddress),
  content: withdrawContentHash,
  rollupVersion: new Fr(version),
  chainId: new Fr(chainId),
});

const witness = await computeL2ToL1MembershipWitness(
  aztecNode,
  txReceipt.blockNumber!,
  l2ToL1Message
);

// Use witness.leafIndex and witness.siblingPath for the L1 consume call
```

:::

## Example implementations

- [Token Portal (L1)](https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260201/l1-contracts/test/portals/TokenPortal.sol)
- [Token Bridge (L2)](https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260201/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr)

## Next steps

Follow the [token bridge tutorial](../../tutorials/js_tutorials/token_bridge.md) for a complete implementation example.
