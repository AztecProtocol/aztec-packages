---
title: Communicating Cross-Chain
tags: [contracts, portals]
sidebar_position: 7
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
| `recipient` | `L2Actor` | Your Aztec contract address that will receive the message |
| `secretHash` | `field` | Hash of a secret for private consumption (use `computeSecretHash`) |
| `content`   | `field` | Message data (hash large data with `sha256ToField`) |

```solidity
/**
 * @notice Inserts a new message into the Inbox
 * @dev Emits `MessageSent` with data for easy access by the sequencer
 * @param _recipient - The recipient of the message
 * @param _content - The content of the message (application specific)
 * @param _secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed
 * on L2)
 * @return The key of the message in the set and its leaf index in the tree
 */
function sendL2Message(DataStructures.L2Actor memory _recipient, bytes32 _content, bytes32 _secretHash)
  external
  returns (bytes32, uint256);
```

### Consume the message in your L2 contract

Use `consume_l1_to_l2_message` in your Aztec contract to process the L1 message:

```rust
pub fn consume_l1_to_l2_message(
    &mut self,
    content: Field,
    secret: Field,
    sender: EthAddress,
    leaf_index: Field,
) {
    let nullifier = process_l1_to_l2_message(
        self.historical_header.state.l1_to_l2_message_tree.root,
        self.this_address(),
        sender,
        self.chain_id(),
        self.version(),
        content,
        secret,
        leaf_index,
    );

    // Push nullifier (and the "commitment" corresponding to this can be "empty")
    self.push_nullifier(nullifier)
}
```

Where:
- `msg_key`: Message hash returned by `sendL2Message`
- `content`: Original message content
- `secret`: Pre-image used to generate `secretHash`

### Example: Generic content hash processing

Use helper functions to compute content hashes for complex data:

```rust
// Consumes a L1->L2 message and executes the appropriate action
#[public]
fn process_l1_message(recipient: AztecAddress, value: u128, secret: Field, message_leaf_index: Field) {
    let content_hash = get_generic_content_hash(recipient, value);

    let config = storage.config.read();

    // Consume message and emit nullifier
    context.consume_l1_to_l2_message(content_hash, secret, config.portal_contract, message_leaf_index);

    // Execute the intended action
    OtherContract::at(config.target_contract).execute_action(recipient, value).call(&mut context);
}
```

Hash large content using `sha256_to_field()`:

```rust
// Computes a content hash of a generic cross-chain message.
// Refer to your L1 portal contract for reference implementation.
pub fn get_generic_content_hash(recipient: AztecAddress, value: u128) -> Field {
    let mut hash_bytes = [0; 68];
    let recipient_bytes: [u8; 32] = recipient.to_field().to_be_bytes();
    let value_bytes: [u8; 32] = (value as Field).to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector =
        comptime { keccak256::keccak256("execute_action(bytes32,uint256)".as_bytes(), 31) };

    for i in 0..4 {
        hash_bytes[i] = selector[i];
    }

    for i in 0..32 {
        hash_bytes[i + 4] = recipient_bytes[i];
        hash_bytes[i + 36] = value_bytes[i];
    }

    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
```

In Solidity, use `Hash.sha256ToField()`:

```solidity
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
```

```solidity
/**
 * @notice Send data to L2 and adds an L2 message which can only be consumed publicly on Aztec
 * @param _recipient - The aztec address of the recipient
 * @param _value - The value to send
 * @param _secretHash - The hash of the secret consumable message. The hash should be 254 bits (so it can fit in a
 * Field element)
 * @return The key of the entry in the Inbox and its leaf index
 */
function sendToL2Public(bytes32 _recipient, uint256 _value, bytes32 _secretHash) external returns (bytes32, uint256)
{
    // Preamble
    DataStructures.L2Actor memory actor = DataStructures.L2Actor(l2Contract, rollupVersion);

    // Hash the message content to be reconstructed in the receiving contract
    // The purpose of including the function selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    bytes32 contentHash = Hash.sha256ToField(abi.encodeWithSignature("execute_action(bytes32,uint256)", _recipient, _value));

    // Perform any L1 actions (e.g., escrow assets, update state)
    performL1Action(msg.sender, _value);

    // Send message to rollup
    (bytes32 key, uint256 index) = inbox.sendL2Message(actor, contentHash, _secretHash);

    // Emit event
    emit MessageSentToL2(_recipient, _value, _secretHash, key, index);

    return (key, index);
}
```

## Send messages from L2 to L1

### Send a message from your L2 contract

Use `message_portal` to send messages from L2 to L1:

```rust
pub fn message_portal(&mut self, recipient: EthAddress, content: Field) {
    let message = L2ToL1Message { recipient, content };
    self.l2_to_l1_msgs.push(message.count(self.next_counter()));
}
```

### Consume the message in your L1 portal

Consume L2 messages in your L1 portal contract using the `Outbox`:

```solidity
/**
 * @notice Consumes an entry from the Outbox
 * @dev Only useable by portals / recipients of messages
 * @dev Emits `MessageConsumed` when consuming messages
 * @param _message - The L2 to L1 message
 * @param _l2BlockNumber - The block number specifying the block that contains the message we want to consume
 * @param _leafIndex - The index inside the merkle tree where the message is located
 * @param _path - The sibling path used to prove inclusion of the message, the _path length directly depends
 * on the total amount of L2 to L1 messages in the block. i.e. the length of _path is equal to the depth of the
 * L1 to L2 message tree.
 */
function consume(
  DataStructures.L2ToL1Msg calldata _message,
  uint256 _l2BlockNumber,
  uint256 _leafIndex,
  bytes32[] calldata _path
) external;
```

### Example: Generic L2 to L1 message processing

Implement access control to ensure only authorized L2 contracts can send messages:

```solidity
/**
 * @notice Process a message from L2
 * @dev Second part of cross-chain flow, must be initiated from L2 first as it will consume a message from outbox
 * @param _recipient - The address to send the result to
 * @param _value - The value to process
 * @param _withCaller - Flag to use `msg.sender` as caller, otherwise address(0)
 * @param _l2BlockNumber - The L2 block number containing the message
 * @param _leafIndex - The leaf index in the message tree
 * @param _path - The merkle path for message verification
 * Must match the caller of the message (specified from L2) to consume it.
 */
function processFromL2(
  address _recipient,
  uint256 _value,
  bool _withCaller,
  uint256 _l2BlockNumber,
  uint256 _leafIndex,
  bytes32[] calldata _path
) external {
  // The purpose of including the function selector is to make the message unique to that specific call. Note that
  // it has nothing to do with calling the function.
  DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
    sender: DataStructures.L2Actor(l2Contract, rollupVersion),
    recipient: DataStructures.L1Actor(address(this), block.chainid),
    content: Hash.sha256ToField(
      abi.encodeWithSignature(
        "processFromL2(address,uint256,address)", _recipient, _value, _withCaller ? msg.sender : address(0)
      )
    )
  });

  outbox.consume(message, _l2BlockNumber, _leafIndex, _path);

  performL1Action(_recipient, _value);
}
```

Example L2 action and message:

```rust
// Performs the appropriate action and creates a L2 to L1 message privately
// Requires `msg.sender` (caller of the method) to give approval using witness signatures
#[private]
fn send_to_l1_private(
    target_contract: AztecAddress,
    recipient: EthAddress, // ethereum address to send to
    value: u128,
    caller_on_l1: EthAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
    authwit_nonce: Field, // nonce used in the approval message by `msg.sender`
) {
    let config = storage.config.read();

    // Assert that user provided contract address is same as seen in storage.
    assert_eq(config.target_contract, target_contract, "Contract address is not the same as seen in storage");

    // Send an L2 to L1 message
    let content = get_l2_to_l1_content_hash(recipient, value, caller_on_l1);
    context.message_portal(config.portal_contract, content);
```

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

### Implement error handling

Handle cross-chain execution failures gracefully:

1. Only consume messages when execution succeeds
2. Include failure recovery mechanisms
3. Keep cross-chain logic simple
4. Handle asynchronous execution scenarios

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

- [Generic Portal (L1)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/l1-contracts/test/portals/TokenPortal.sol)
- [Generic Bridge (L2)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr)

## Next steps

Follow the [cross-chain messaging tutorial](../../tutorials/js_tutorials/token_bridge.md) for a complete implementation example.
