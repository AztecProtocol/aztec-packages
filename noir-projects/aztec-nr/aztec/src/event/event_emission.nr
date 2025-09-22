use crate::{
    context::{PrivateContext, PublicContext},
    event::event_interface::EventInterface,
    messages::{
        logs::{event::to_encrypted_private_event_message, utils::prefix_with_tag},
        message_delivery::MessageDelivery,
        offchain_messages::emit_offchain_message,
    },
    utils::remove_constraints::remove_constraints_if,
};
use protocol_types::{
    address::AztecAddress,
    constants::GENERATOR_INDEX__EVENT_COMMITMENT,
    hash::poseidon2_hash_with_separator,
    traits::{Serialize, ToField},
};

/// Emits an event that can be delivered either via private logs or offchain messages, with configurable encryption and
/// tagging constraints.
///
/// # Arguments
/// * `event` - The event to emit
/// * `context` - The private context to emit the event in
/// * `recipient` - The address that should receive this event
/// * `delivery_mode` - Controls encryption, tagging, and delivery constraints. Must be a compile-time constant.
///   See `MessageDeliveryEnum` for details on the available modes.
pub fn emit_event_in_private<Event>(
    event: Event,
    context: &mut PrivateContext,
    recipient: AztecAddress,
    delivery_mode: u8,
)
where
    Event: EventInterface + Serialize,
{
    // This function relies on `delivery_mode` being a constant in order to reduce circuit constraints when unconstrained
    // usage is requested. If `delivery_mode` were a runtime value then performance would suffer.
    assert_constant(delivery_mode);

    // The following maps out the 3 dimensions across which we configure message delivery.
    let constrained_encryption = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;
    let emit_as_offchain_message = delivery_mode == MessageDelivery.UNCONSTRAINED_OFFCHAIN;
    // TODO(#14565): Add constrained tagging
    let _constrained_tagging = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;

    let (ciphertext, randomness) = remove_constraints_if(
        !constrained_encryption,
        || to_encrypted_private_event_message(event, recipient),
    );

    // We generate a cryptographic commitment to the event to ensure its authenticity during offchain delivery.
    // The nullifier tree is chosen over the note hash tree for this purpose since it provides a simpler mechanism
    // - nullifiers require no nonce, and events, being non-spendable, don't need the guarantee that a "spending"
    // nullifier can be computed.
    // TODO(#11571): with decryption happening in Noir we can now use the Packable trait instead.
    let serialized_event_with_randomness = [randomness].concat(event.serialize());
    let event_commitment = poseidon2_hash_with_separator(
        serialized_event_with_randomness,
        GENERATOR_INDEX__EVENT_COMMITMENT,
    );
    context.push_nullifier(event_commitment);

    if emit_as_offchain_message {
        emit_offchain_message(ciphertext, recipient);
    } else {
        // Safety: Currently unsafe. See description of CONSTRAINED_ONCHAIN in MessageDeliveryEnum.
        // TODO(#14565): Implement proper constrained tag prefixing to make this truly CONSTRAINED_ONCHAIN
        let log_content = prefix_with_tag(ciphertext, recipient);

        context.emit_private_log(log_content, log_content.len());
    }
}

pub fn emit_event_in_public<Event>(event: Event, context: &mut PublicContext)
where
    Event: EventInterface + Serialize,
{
    let mut log_content = [0; <Event as Serialize>::N + 1];

    let serialized_event = event.serialize();
    for i in 0..serialized_event.len() {
        log_content[i] = serialized_event[i];
    }

    // We put the selector in the "last" place, to avoid reading or assigning to an expression in an index
    log_content[serialized_event.len()] = Event::get_event_type_id().to_field();

    context.emit_public_log(log_content);
}
