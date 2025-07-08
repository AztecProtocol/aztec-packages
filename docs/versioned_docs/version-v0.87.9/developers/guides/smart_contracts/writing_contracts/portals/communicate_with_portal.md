---
title: Communicating with L1
tags: [contracts, portals]
---

Follow the [token bridge tutorial](../../../../../developers/tutorials/codealong/js_tutorials/token_bridge.md) for hands-on experience writing and deploying a Portal contract.

## Passing data to the rollup

Whether it is tokens or other information being passed to the rollup, the portal should use the `Inbox` to do it.

The `Inbox` can be seen as a mailbox to the rollup, portals put messages into the box, and the sequencer then consumes a batch of messages from the box and include it in their blocks.

When sending messages, we need to specify quite a bit of information beyond just the content that we are sharing. Namely we need to specify:

| Name        | Type                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipient   | `L2Actor`           | The message recipient. This **MUST** match the rollup version and an Aztec contract that is **attached** to the contract making this call. If the recipient is not attached to the caller, the message cannot be consumed by it.                                                                                                                                                                                                            |
| Secret Hash | `field` (~254 bits) | A hash of a secret that is used when consuming the message on L2. Keep this preimage a secret to make the consumption private. To consume the message the caller must know the pre-image (the value that was hashed) - so make sure your app keeps track of the pre-images! Use `computeSecretHash` to compute it from a secret.                                                                                                            |
| Content     | `field` (~254 bits) | The content of the message. This is the data that will be passed to the recipient. The content is limited to be a single field. If the content is small enough it can just be passed along, otherwise it should be hashed and the hash passed along (you can use our [`Hash` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/libraries/Hash.sol) utilities with `sha256ToField` functions) |

With all that information at hand, we can call the `sendL2Message` function on the Inbox. The function will return a `field` (inside `bytes32`) that is the hash of the message. This hash can be used as an identifier to spot when your message has been included in a rollup block.

```solidity title="send_l1_to_l2_message" showLineNumbers 
/**
 * @notice Inserts a new message into the Inbox
 * @dev Emits `MessageSent` with data for easy access by the sequencer
 * @param _recipient - The recipient of the message
 * @param _content - The content of the message (application specific)
 * @param _secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed on L2)
 * @return The key of the message in the set and its leaf index in the tree
 */
function sendL2Message(
  DataStructures.L2Actor memory _recipient,
  bytes32 _content,
  bytes32 _secretHash
) external returns (bytes32, uint256);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/l1-contracts/src/core/interfaces/messagebridge/IInbox.sol#L35-L49" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/interfaces/messagebridge/IInbox.sol#L35-L49</a></sub></sup>


A sequencer will consume the message batch your message was included in and include it in their block.
Upon inclusion, it is made available to be consumed on L2 via the L2 outbox.

To consume the message, we can use the `consume_l1_to_l2_message` function within the `context` struct.

- The `msg_key` is the hash of the message returned by the `sendL2Message` call and is used to help the RPC find the correct message.
- The `content` is the content of the message, limited to one Field element. For content larger than one Field, we suggest using the `sha256` hash function truncated to a single Field element. `sha256` is suggested as it is cheap on L1 while still being manageable on L2.
- The `secret` is the pre-image hashed using Pedersen to compute the `secretHash`.
- If the `content` or `secret` does not match the entry at `msg_key` the message will not be consumed, and the transaction will revert.

:::info
Note that while the `secret` and the `content` are both hashed, they are actually hashed with different hash functions!
:::

```rust title="context_consume_l1_to_l2_message" showLineNumbers 
pub fn consume_l1_to_l2_message(
    &mut self,
    content: Field,
    secret: Field,
    sender: EthAddress,
    leaf_index: Field,
) {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/aztec-nr/aztec/src/context/private_context.nr#L292-L301" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/aztec/src/context/private_context.nr#L292-L301</a></sub></sup>


### Token bridge example

Computing the `content` must currently be done manually, as we are still adding a number of bytes utilities. A good example exists within the [Token bridge example (codealong tutorial)](../../../../../developers/tutorials/codealong/js_tutorials/token_bridge.md).

```rust title="claim_public" showLineNumbers 
// Consumes a L1->L2 message and calls the token contract to mint the appropriate amount publicly
#[public]
fn claim_public(to: AztecAddress, amount: u128, secret: Field, message_leaf_index: Field) {
    let content_hash = get_mint_to_public_content_hash(to, amount);

    let config = storage.config.read();

    // Consume message and emit nullifier
    context.consume_l1_to_l2_message(content_hash, secret, config.portal, message_leaf_index);

    // Mint tokens
    Token::at(config.token).mint_to_public(to, amount).call(&mut context);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L57-L71" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L57-L71</a></sub></sup>


:::info
The `content_hash` is a sha256 truncated to a field element (~ 254 bits). In Aztec.nr, you can use our `sha256_to_field()` to do a sha256 hash which fits in one field element
:::

### Token portal hash library

```rust title="mint_to_public_content_hash_nr" showLineNumbers 
use dep::aztec::prelude::{AztecAddress, EthAddress};
use dep::aztec::protocol_types::{hash::sha256_to_field, traits::ToField};

// Computes a content hash of a deposit/mint_to_public message.
// Refer TokenPortal.sol for reference on L1.
pub fn get_mint_to_public_content_hash(owner: AztecAddress, amount: u128) -> Field {
    let mut hash_bytes = [0; 68];
    let recipient_bytes: [u8; 32] = owner.to_field().to_be_bytes();
    let amount_bytes: [u8; 32] = (amount as Field).to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector =
        comptime { keccak256::keccak256("mint_to_public(bytes32,uint256)".as_bytes(), 31) };

    for i in 0..4 {
        hash_bytes[i] = selector[i];
    }

    for i in 0..32 {
        hash_bytes[i + 4] = recipient_bytes[i];
        hash_bytes[i + 36] = amount_bytes[i];
    }

    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/noir-contracts/contracts/libs/token_portal_content_hash_lib/src/lib.nr#L1-L29" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/libs/token_portal_content_hash_lib/src/lib.nr#L1-L29</a></sub></sup>


### Token Portal contract

In Solidity, you can use our `Hash.sha256ToField()` method:

```solidity title="content_hash_sol_import" showLineNumbers 
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/l1-contracts/test/portals/TokenPortal.sol#L12-L14" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/test/portals/TokenPortal.sol#L12-L14</a></sub></sup>


```solidity title="deposit_public" showLineNumbers 
/**
 * @notice Deposit funds into the portal and adds an L2 message which can only be consumed publicly on Aztec
 * @param _to - The aztec address of the recipient
 * @param _amount - The amount to deposit
 * @param _secretHash - The hash of the secret consumable message. The hash should be 254 bits (so it can fit in a Field element)
 * @return The key of the entry in the Inbox and its leaf index
 */
function depositToAztecPublic(bytes32 _to, uint256 _amount, bytes32 _secretHash)
  external
  returns (bytes32, uint256)
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/l1-contracts/test/portals/TokenPortal.sol#L55-L66" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/test/portals/TokenPortal.sol#L55-L66</a></sub></sup>


The `secret_hash` uses the pederson hash which fits in a field element. You can use the utility method `computeSecretHash()`in `@aztec/aztec.js` npm package to generate a secret and its corresponding hash.

After the transaction has been mined, the message is consumed, a nullifier is emitted and the tokens have been minted on Aztec and are ready for claiming.

Since the message consumption is emitting a nullifier, the same message cannot be consumed again. The index in the message tree is used as part of the nullifier computation, ensuring that the same content and secret being inserted will be distinct messages that can each be consumed. Without the index in the nullifier, it would be possible to perform a kind of attack known as `Faerie Gold` attacks where two seemingly good messages are inserted, but only one of them can be consumed later.

## Passing data to L1

To pass data to L1, we use the `Outbox`. The `Outbox` is the mailbox for L2 to L1 messages. This is the location on L1 where all the messages from L2 will live, and where they can be consumed from.

:::danger

Similarly to messages going to L2 from L1, a message can only be consumed by the specified recipient. But it is up to the portal contract to ensure that the sender is as expected! Any L2 contract can send a message to a portal contract on L1, but the portal contract should only consume messages from the expected sender.

:::

The portal must ensure that the sender is as expected. One flexible solution is to have an `initialize` function in the portal contract which can be used to set the address of the Aztec contract. In this model, the portal contract can check that the sender matches the value it has in storage.

To send a message to L1 from your Aztec contract, you must use the `message_portal` function on the `context`. When messaging to L1, only the `content` is required (as a `Field`).

```rust title="context_message_portal" showLineNumbers 
pub fn message_portal(&mut self, recipient: EthAddress, content: Field) {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/aztec-nr/aztec/src/context/private_context.nr#L285-L287" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/aztec/src/context/private_context.nr#L285-L287</a></sub></sup>


When sending a message from L2 to L1 we don't need to pass in a secret.

:::danger
Access control on the L1 portal contract is essential to prevent consumption of messages sent from the wrong L2 contract.
:::

### Token bridge

As earlier, we can use a token bridge as an example. In this case, we are burning tokens on L2 and sending a message to the portal to free them on L1.

```rust title="exit_to_l1_private" showLineNumbers 
// Burns the appropriate amount of tokens and creates a L2 to L1 withdraw message privately
// Requires `msg.sender` (caller of the method) to give approval to the bridge to burn tokens on their behalf using witness signatures
#[private]
fn exit_to_l1_private(
    token: AztecAddress,
    recipient: EthAddress, // ethereum address to withdraw to
    amount: u128,
    caller_on_l1: EthAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
    nonce: Field, // nonce used in the approval message by `msg.sender` to let bridge burn their tokens on L2
) {
    let config = storage.config.read();

    // Assert that user provided token address is same as seen in storage.
    assert_eq(config.token, token, "Token address is not the same as seen in storage");

    // Send an L2 to L1 message
    let content = get_withdraw_content_hash(recipient, amount, caller_on_l1);
    context.message_portal(config.portal, content);

    // Burn tokens
    Token::at(token).burn_private(context.msg_sender(), amount, nonce).call(&mut context);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L125-L150" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr#L125-L150</a></sub></sup>


When the transaction is included in a rollup block and published to Ethereum the message will be inserted into the `Outbox` on Ethereum, where the recipient portal can consume it from. When consuming, the `msg.sender` must match the `recipient` meaning that only portal can actually consume the message.

```solidity title="l2_to_l1_msg" showLineNumbers 
/**
 * @notice Struct containing a message from L2 to L1
 * @param sender - The sender of the message
 * @param recipient - The recipient of the message
 * @param content - The content of the message (application specific) padded to bytes32 or hashed if larger.
 * @dev Not to be confused with L2ToL1Message in Noir circuits
 */
struct L2ToL1Msg {
  DataStructures.L2Actor sender;
  DataStructures.L1Actor recipient;
  bytes32 content;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/l1-contracts/src/core/libraries/DataStructures.sol#L53-L66" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/libraries/DataStructures.sol#L53-L66</a></sub></sup>


#### Outbox `consume`

```solidity title="outbox_consume" showLineNumbers 
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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol#L35-L53" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol#L35-L53</a></sub></sup>


#### Withdraw

As noted earlier, the portal contract should check that the sender is as expected. In the example below, we support only one sender contract (stored in `l2TokenAddress`) so we can just pass it as the sender, that way we will only be able to consume messages from that contract.

It is possible to support multiple senders from L2. You could use a have `mapping(address => bool) allowed` and check that `allowed[msg.sender]` is `true`.

```solidity title="token_portal_withdraw" showLineNumbers 
/**
 * @notice Withdraw funds from the portal
 * @dev Second part of withdraw, must be initiated from L2 first as it will consume a message from outbox
 * @param _recipient - The address to send the funds to
 * @param _amount - The amount to withdraw
 * @param _withCaller - Flag to use `msg.sender` as caller, otherwise address(0)
 * @param _l2BlockNumber - The address to send the funds to
 * @param _leafIndex - The amount to withdraw
 * @param _path - Flag to use `msg.sender` as caller, otherwise address(0)
 * Must match the caller of the message (specified from L2) to consume it.
 */
function withdraw(
  address _recipient,
  uint256 _amount,
  bool _withCaller,
  uint256 _l2BlockNumber,
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
        "withdraw(address,uint256,address)",
        _recipient,
        _amount,
        _withCaller ? msg.sender : address(0)
      )
    )
  });

  outbox.consume(message, _l2BlockNumber, _leafIndex, _path);

  underlying.transfer(_recipient, _amount);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/l1-contracts/test/portals/TokenPortal.sol#L122-L161" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/test/portals/TokenPortal.sol#L122-L161</a></sub></sup>


## Considerations

### Structure of messages

Application developers should consider creating messages that follow a function call structure e.g., using a function signature and arguments. This will make it easier to prevent producing messages that could be misinterpreted by the recipient.

An example of a bad format would be using `amount, token_address, recipient_address` as the message for a withdraw function and `amount, token_address, on_behalf_of_address` for a deposit function. Any deposit could then also be mapped to a withdraw or vice versa.

```solidity
// Don't to this!
bytes memory message = abi.encode(
  _amount,
  _token,
  _to
);

// Do this!
bytes memory message abi.encodeWithSignature(
  "withdraw(uint256,address,address)",
  _amount,
  _token,
  _to
);
```

### Error Handling

Handling error when moving cross chain can quickly get tricky. Since the L1 and L2 calls are async and independent of each other, the L1 part of a deposit might execute just fine, with the L2 part failing. If this is not handled well, the funds may be lost forever! Developers should consider ways their application can fail cross chain, and handle all cases explicitly.

First, entries in the outboxes **SHOULD** only be consumed if the execution is successful. For an L2 -> L1 call, the L1 execution can revert the transaction completely if anything fails. As the tx is atomic, the failure also reverts consumption.

If it is possible to enter a state where the second part of the execution fails forever, the application builder should consider including additional failure mechanisms (for token withdraws this could be depositing them again etc).

Generally it is good practice to keep cross-chain calls simple to avoid too many edge cases and state reversions.

:::info
Error handling for cross chain messages is handled by the application contract and not the protocol. The protocol only delivers the messages, it does not ensure that they are executed successfully.
:::

### Designated caller

Designating a caller grants the ability to specify who should be able to call a function that consumes a message. This is useful for ordering of batched messages.

When performing multiple cross-chain calls in one action it is important to consider the order of the calls. Say for example, that you want to perform a uniswap trade on L1. You would withdraw funds from the rollup, swap them on L1, and then deposit the swapped funds back into the rollup. This is a straightforward process, but it requires that the calls are done in the correct order (e.g. if the swap is called before the funds are withdrawn, the swap will fail).

The message boxes (Inbox and Outbox) will only allow the recipient portal to consume the message, and we can use this to ensure that the calls are done in the correct order. Say that we include a designated "caller" in the messages, and that the portal contract checks that the caller matches the designated caller or designated as `address(0)` (if anyone can call). When the messages are to be consumed on L1, it can compute the message as seen below:

```solidity
bytes memory message = abi.encodeWithSignature(
  "withdraw(uint256,address,address)",
  _amount,
  _to,
  _withCaller ? msg.sender : address(0)
);
```

This way, the message can be consumed by the portal contract, but only if the caller is the specified caller. In the logic of the contract that is the designated caller, we can ensure that the calls are done in the correct order.

For example, we could require that the Uniswap portal is the caller of the withdrawal, and ensure that the uniswap portal contract implementation is executing the withdrawal before the swap.
The order of execution can be specified in the contract. Since all of the messages are emitted to L1 in the same transaction, we can leverage transaction atomicity to ensure success of failure of all messages.

Note, that crossing the L1/L2 chasm is asynchronous, so there could be a situation where the user has burned their assets on L2 but the swap fails on L1! This could be due to major price movements for example. In such a case, the user could be stuck with funds on L1 that they cannot get back to L2 unless the portal contract implements a way to properly handle such errors.

:::caution
Designated callers are enforced at the contract level for contracts that are not the rollup itself, and should not be trusted to implement the contract correctly. The user should always be aware that it is possible for the developer to implement something that looks like designated caller without providing the abilities to the user.
:::

## Examples of portals

- Token bridge (Portal contract built for L1 -> L2, i.e., a non-native L2 asset)
  - [Portal contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/l1-contracts/test/portals/TokenPortal.sol)
  - [Aztec contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/noir-contracts/contracts/app/token_bridge_contract/src/main.nr)
