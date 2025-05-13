---
title: Emitting Events
sidebar_position: 4
tags: [contracts]
---

Events in Aztec work similarly to Ethereum events in the sense that they are a way for contracts to communicate with the outside world.

Events are structured pieces of data that can be emitted privately, from private functions, or publicly, from public functions. They include metadata about the event type, so people can query events to look for specific information.

There are also public logs, which are similar to events, but are unstructured data.

## Private Events

To emit encrypted logs you can import the `encode_and_encrypt_event` or `encode_and_encrypt_event_unconstrained` functions and pass them into the `emit` function. An example can be seen in the reference token contract's transfer function:

#include_code encrypted_unconstrained /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

- `encode_and_encrypt_event` Sends an encrypted message to `recipient` with the content of the event, which they will discover when processing private logs.
- `encode_and_encrypt_event_unconstrained` is the same as `encode_and_encrypt_event`, except encryption is unconstrained. This means that the sender is free to make the log contents be whatever they wish, so the recipient is trusting the sender of the event. This could also potentially result in scenarios in which the recipient is unable to decrypt and process the payload, **leading to the event being lost**. Only use this function in scenarios where the recipient not receiving the event is an acceptable outcome.

:::note
Developer can choose whether to emit encrypted events or not. Emitting the events means that they will be posted to Ethereum, in blobs, and will inherit the availability guarantees of Ethereum. Developers may choose not to emit events and to share information with recipients off-chain, or through alternative mechanisms that are to be developed (e.g. alternative, cheaper data availability solutions).
:::

You can find the implementation of event logging [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/messages/logs/event.nr)

### Processing encrypted events

Contracts created using aztec-nr will try to discover newly created events by searching for logs emitted for any of the accounts registered inside PXE, decrypting their contents and notifying PXE of any events found. This process is automatic and occurs whenever a contract function is invoked.

## Public Events

You can emit public events by calling the `emit` function on the event type that you would like to emit. For example:

#include_code emit_public /noir-projects/noir-contracts/contracts/test/test_log_contract/src/main.nr rust

## Public Logs

Public logs are unstructured data which can be read by anyone. They can be emitted **only** by public functions.

### Call emit_public_log

To emit public logs you don't need to import any library. You call the context method `emit_public_log`:

#include_code emit_public /noir-projects/noir-contracts/contracts/test/test_contract/src/main.nr rust

### Querying the unencrypted event

Once emitted, unencrypted events are stored in AztecNode and can be queried by anyone:

#include_code get_logs /yarn-project/end-to-end/src/e2e_ordering.test.ts typescript

## Costs

Event data is pushed to Ethereum, in blobs, by the sequencer and for this reason the cost of emitting an event can be non-trivial. As mentioned above, emitting encrypted events is optional and there will likely be alternative options for developers to choose from in the future.
