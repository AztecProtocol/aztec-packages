---
title: Communicating with L1
tags: [contracts, portals]
---

Is this your first time hearing the word `Portal`? You might want to check out the [protocol specs](../../../../../protocol-specs/l1-smart-contracts/index.md).

Follow the [token bridge tutorial](../../../../../tutorials/codealong/contract_tutorials/advanced/token_bridge/index.md) for hands-on experience writing and deploying a Portal contract.

## Passing data to the rollup

Whether it is tokens or other information being passed to the rollup, the portal should use the `Inbox` to do it.

The `Inbox` can be seen as a mailbox to the rollup, portals put messages into the box, and the sequencer then consumes a batch of messages from the box and include it in their blocks.

When sending messages, we need to specify quite a bit of information beyond just the content that we are sharing. Namely we need to specify:

| Name        | Type                | Description                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipient   | `L2Actor`           | The message recipient. This **MUST** match the rollup version and an Aztec contract that is **attached** to the contract making this call. If the recipient is not attached to the caller, the message cannot be consumed by it.                                                                                                                                                                                              |
| Secret Hash | `field` (~254 bits) | A hash of a secret that is used when consuming the message on L2. Keep this preimage a secret to make the consumption private. To consume the message the caller must know the pre-image (the value that was hashed) - so make sure your app keeps track of the pre-images! Use `computeSecretHash` to compute it from a secret.                                                                                              |
| Content     | `field` (~254 bits) | The content of the message. This is the data that will be passed to the recipient. The content is limited to be a single field. If the content is small enough it can just be passed along, otherwise it should be hashed and the hash passed along (you can use our [`Hash` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/core/libraries/Hash.sol) utilities with `sha256ToField` functions) |

With all that information at hand, we can call the `sendL2Message` function on the Inbox. The function will return a `field` (inside `bytes32`) that is the hash of the message. This hash can be used as an identifier to spot when your message has been included in a rollup block.

#include_code send_l1_to_l2_message l1-contracts/src/core/interfaces/messagebridge/IInbox.sol solidity

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

#include_code context_consume_l1_to_l2_message /noir-projects/aztec-nr/aztec/src/context/private_context.nr rust

### Token bridge example

Computing the `content` must currently be done manually, as we are still adding a number of bytes utilities. A good example exists within the [Token bridge example (codealong tutorial)](../../../../../tutorials/codealong/contract_tutorials/advanced/token_bridge/index.md).

#include_code claim_public /noir-projects/noir-contracts/contracts/token_bridge_contract/src/main.nr rust

:::info
The `content_hash` is a sha256 truncated to a field element (~ 254 bits). In Aztec.nr, you can use our `sha256_to_field()` to do a sha256 hash which fits in one field element
:::

### Token portal hash library

#include_code mint_public_content_hash_nr /noir-projects/noir-contracts/contracts/token_portal_content_hash_lib/src/lib.nr rust

### Token Portal contract

In Solidity, you can use our `Hash.sha256ToField()` method:

#include_code content_hash_sol_import l1-contracts/test/portals/TokenPortal.sol solidity

#include_code deposit_public l1-contracts/test/portals/TokenPortal.sol solidity

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

#include_code context_message_portal /noir-projects/aztec-nr/aztec/src/context/private_context.nr rust

When sending a message from L2 to L1 we don't need to pass in a secret.

:::danger
Access control on the L1 portal contract is essential to prevent consumption of messages sent from the wrong L2 contract.
:::

### Token bridge

As earlier, we can use a token bridge as an example. In this case, we are burning tokens on L2 and sending a message to the portal to free them on L1.

#include_code exit_to_l1_private noir-projects/noir-contracts/contracts/token_bridge_contract/src/main.nr rust

When the transaction is included in a rollup block and published to Ethereum the message will be inserted into the `Outbox` on Ethereum, where the recipient portal can consume it from. When consuming, the `msg.sender` must match the `recipient` meaning that only portal can actually consume the message.

#include_code l2_to_l1_msg l1-contracts/src/core/libraries/DataStructures.sol solidity

#### Outbox `consume`

#include_code outbox_consume l1-contracts/src/core/interfaces/messagebridge/IOutbox.sol solidity

#### Withdraw

As noted earlier, the portal contract should check that the sender is as expected. In the example below, we support only one sender contract (stored in `l2TokenAddress`) so we can just pass it as the sender, that way we will only be able to consume messages from that contract.

It is possible to support multiple senders from L2. You could use a have `mapping(address => bool) allowed` and check that `allowed[msg.sender]` is `true`.

#include_code token_portal_withdraw l1-contracts/test/portals/TokenPortal.sol solidity

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
  - [Portal contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/test/portals/TokenPortal.sol)
  - [Aztec contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/token_bridge_contract/src/main.nr)
