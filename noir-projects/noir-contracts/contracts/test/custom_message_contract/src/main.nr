mod multi_log;

use crate::multi_log::{MULTI_LOG_PARTS_SEPARATOR, MultiLog};
use ::aztec::{
    event::{event_interface::compute_private_serialized_event_commitment, EventSelector},
    messages::{
        encoding::MAX_MESSAGE_CONTENT_LEN,
        logs::event::MAX_EVENT_SERIALIZED_LEN,
        msg_type::custom_msg_type_id,
        processing::{enqueue_event_for_validation, MessageContext},
    },
    oracle::capsules,
    protocol::{address::AztecAddress, hash::poseidon2_hash, traits::FromField},
};
use ::aztec::macros::aztec;

/// Custom message type ID for multi-log messages.
global MULTI_LOG_MSG_TYPE_ID: u64 = custom_msg_type_id(0);

/// Number of parts this contract splits multi-log events into.
global NUM_MULTI_LOG_PARTS: u32 = 2;

/// Reassembles multi-log messages.
///
/// Parts of an event are accumulated in a single capsule keyed by `message_id`. Each part is placed directly at
/// its index in a fixed-size array; a part with `len() == 0` hasn't arrived yet. When all parts are present, the
/// full event is reconstructed and enqueued for validation.
// #[contract_library_method]
unconstrained fn handle_multi_log_message(
    contract_address: AztecAddress,
    msg_type_id: u64,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    message_context: MessageContext,
    scope: AztecAddress,
) {
    if msg_type_id == MULTI_LOG_MSG_TYPE_ID {
        let part_number = MultiLog::<NUM_MULTI_LOG_PARTS>::unpack_part_number(msg_metadata);

        // First field of every part's content is the message_id (= randomness).
        let message_id = msg_content.get(0);
        let slot = poseidon2_hash([MULTI_LOG_PARTS_SEPARATOR, message_id]);

        // Load (or initialize) the pending event and place this part at its index.
        let mut multi_log: MultiLog<NUM_MULTI_LOG_PARTS> = capsules::load(contract_address, slot, scope).unwrap_or(
            MultiLog { parts: [BoundedVec::new(); NUM_MULTI_LOG_PARTS] },
        );
        multi_log.parts[part_number] = msg_content;

        if multi_log.is_complete() {
            // All parts present, reassemble the event in part order.
            // Part 0 content: [randomness, event_type_id, ...event_fields]
            // Part N content: [randomness, ...event_fields]
            let randomness = message_id;
            let mut event_type_id_field: Field = 0;
            let mut serialized_event: BoundedVec<Field, MAX_EVENT_SERIALIZED_LEN> = BoundedVec::new();

            for part_index in 0..NUM_MULTI_LOG_PARTS {
                let content = multi_log.parts[part_index];
                let content_start = if part_index == 0 {
                    // Part 0: content[1] is event_type_id, content[2..] are event fields
                    event_type_id_field = content.get(1);
                    2
                } else {
                    // Other parts: content[1..] are event fields
                    1
                };

                for content_index in content_start..content.len() {
                    serialized_event.push(content.get(content_index));
                }
            }

            capsules::delete(contract_address, slot, scope);

            let event_type_id = EventSelector::from_field(event_type_id_field);
            let event_commitment =
                compute_private_serialized_event_commitment(serialized_event, randomness, event_type_id_field);

            enqueue_event_for_validation(
                contract_address,
                event_type_id,
                randomness,
                serialized_event,
                event_commitment,
                message_context.tx_hash,
            );
        } else {
            capsules::store(contract_address, slot, multi_log, scope);
        }
    } else {
        panic(f"Unknown message type id: {msg_type_id}");
    }
}

/// Tests the custom message handler feature by implementing a multi-log event pattern: a single event is split across
/// multiple private messages (each carrying a part), and the custom message handler reassembles the parts into the full
/// event before enqueueing it for validation. This exercises custom message type IDs, the `AztecConfig` builder, and
/// capsule-based accumulation of out-of-order message parts.
#[aztec(::aztec::macros::AztecConfig::new().custom_message_handler(crate::handle_multi_log_message))]
contract CustomMessage {
    use crate::multi_log::MultiLog;
    use crate::{MULTI_LOG_MSG_TYPE_ID, NUM_MULTI_LOG_PARTS};
    use aztec::{
        event::event_interface::{compute_private_event_commitment, EventInterface},
        macros::{events::event, functions::external},
        messages::{encoding::encode_message, message_delivery::{do_private_message_delivery, MessageDelivery}},
        oracle::random::random,
        protocol::{address::AztecAddress, traits::ToField},
    };

    /// An event with 4 fields, too large to demonstrate fitting in one message content.
    ///
    /// In practice we'd probably use this for events exceeding MAX_EVENT_SERIALIZED_LEN.
    #[event]
    struct MultiLogEvent {
        value0: Field,
        value1: Field,
        value2: Field,
        value3: Field,
    }

    /// Emits a multi-log event split across 2 private messages.
    ///
    /// This demonstrates the multi-log event pattern: the event data is split into parts, each sent as a separate
    /// message with a custom message type. The receiver's custom message handler reassembles them.
    ///
    /// Each part includes `randomness` as its first content field, which serves as a `message_id` for correlating
    /// parts belonging to the same multi-log event (allowing multiple multi-log events per transaction).
    ///
    /// # Privacy considerations
    ///
    /// Each part is sent as a separate onchain message (using private logs as transport). While the content is
    /// encrypted, the number of logs per transaction is publicly observable. This means an observer can distinguish
    /// transactions using the multi-log pattern (N logs) from those emitting standard single-log messages, and can
    /// infer the number of parts from the log count.
    ///
    /// Split layout:
    ///   Part 0 (metadata=pack(0,2)): content = [randomness, event_type_id, value0, value1]
    ///   Part 1 (metadata=pack(1,2)): content = [randomness, value2, value3]
    #[external("private")]
    fn emit_multi_log_event(value0: Field, value1: Field, value2: Field, value3: Field, recipient: AztecAddress) {
        let event = MultiLogEvent { value0, value1, value2, value3 };

        // Safety: randomness produced by the sender, same trust model as standard events.
        let randomness = unsafe { random() };

        // Emit commitment as nullifier computed from FULL event (same as standard events)
        let commitment = compute_private_event_commitment(event, randomness);
        self.context.push_nullifier_unsafe(commitment);

        let event_type_id = MultiLogEvent::get_event_type_id().to_field();

        // Part 0: randomness (message_id), event_type_id, and first 2 event fields
        let msg0 = encode_message(
            MULTI_LOG_MSG_TYPE_ID,
            MultiLog::<NUM_MULTI_LOG_PARTS>::pack_part_metadata(0),
            [randomness, event_type_id, value0, value1],
        );
        do_private_message_delivery(
            self.context,
            || msg0,
            Option::none(),
            recipient,
            MessageDelivery.ONCHAIN_UNCONSTRAINED,
        );

        // Part 1: randomness (message_id) and remaining event fields
        let msg1 = encode_message(
            MULTI_LOG_MSG_TYPE_ID,
            MultiLog::<NUM_MULTI_LOG_PARTS>::pack_part_metadata(1),
            [randomness, value2, value3],
        );
        do_private_message_delivery(
            self.context,
            || msg1,
            Option::none(),
            recipient,
            MessageDelivery.ONCHAIN_UNCONSTRAINED,
        );
    }
}
