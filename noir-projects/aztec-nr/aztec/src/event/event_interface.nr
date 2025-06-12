use crate::{
    context::{PrivateContext, PublicContext},
    messages::logs::{event::to_encrypted_private_event_message, utils::prefix_with_tag},
    utils::remove_constraints::remove_constraints_if,
};
use dep::protocol_types::{
    abis::event_selector::EventSelector,
    address::AztecAddress,
    constants::GENERATOR_INDEX__EVENT_COMMITMENT,
    hash::poseidon2_hash_with_separator,
    traits::{Serialize, ToField},
    utils::arrays::array_concat,
};

pub struct PrivateLogContentConstraintsEnum {
    /// The contents of the log are entirely unconstrained, and could have any values.
    ///
    /// Only use in scenarios where the recipient not receiving the message is an acceptable outcome (e.g. because the
    /// sender is somehow motivated to ensure the recipient learns of it).
    pub NO_CONSTRAINTS: u8,
    /// The contents of the log and its encryption are constrained. The tag (and therefore whether the recipient is
    /// actually able to find the message) is not.
    ///
    /// Only use in scenarios where the recipient not receiving the message is an acceptable outcome (e.g. because the
    /// sender is somehow motivated to ensure the recipient learns of it).
    // TODO(#14565): This variant requires for tagging to also be constrained, as it is otherwise useless.
    pub CONSTRAINED_ENCRYPTION: u8,
}

pub global PrivateLogContent: PrivateLogContentConstraintsEnum = PrivateLogContentConstraintsEnum {
    NO_CONSTRAINTS: 1,
    CONSTRAINED_ENCRYPTION: 2,
    // TODO: add constrained tagging and constrained handshaking
};

/// Emits an event in a private log, encrypting it such that only `recipient` will learn of its contents. The log will
/// be tagged using a shared secret between `sender` and `recipient`, so that `recipient` can efficiently find the log.
///
/// The `constraints` value determines what parts of this computation will be constrained. See the documentation for
/// each value in `PrivateLogContentConstraintsEnum` to learn more about the different variants.
pub fn emit_event_in_private_log<Event, let N: u32>(
    event: Event,
    context: &mut PrivateContext,
    sender: AztecAddress,
    recipient: AztecAddress,
    constraints: u8,
)
where
    Event: EventInterface + Serialize<N>,
{
    // This function relies on `constraints` being a constant in order to reduce circuit constraints when unconstrained
    // usage is requested. If `constraints` were a runtime value then performance would suffer.
    assert_constant(constraints);

    let (ciphertext, randomness) = remove_constraints_if(
        constraints == PrivateLogContent.NO_CONSTRAINTS,
        || to_encrypted_private_event_message(event, recipient),
    );
    let log_content = prefix_with_tag(ciphertext, sender, recipient);

    // We generate a cryptographic commitment to the event to ensure its authenticity during out-of-band delivery.
    // The nullifier tree is chosen over the note hash tree for this purpose since it provides a simpler mechanism
    // - nullifiers require no nonce, and events, being non-spendable, don't need the guarantee that a "spending"
    // nullifier can be computed.
    // TODO(#11571): with decryption happening in Noir we can now use the Packable trait instead.
    let serialized_event_with_randomness = array_concat([randomness], event.serialize());
    let event_commitment = poseidon2_hash_with_separator(
        serialized_event_with_randomness,
        GENERATOR_INDEX__EVENT_COMMITMENT,
    );
    context.push_nullifier(event_commitment);

    context.emit_private_log(log_content, log_content.len());
}

pub fn emit_event_in_public_log<Event, let N: u32>(event: Event, context: &mut PublicContext)
where
    Event: EventInterface + Serialize<N>,
{
    let mut log_content = [0; N + 1];

    let serialized_event = event.serialize();
    for i in 0..serialized_event.len() {
        log_content[i] = serialized_event[i];
    }

    // We put the selector in the "last" place, to avoid reading or assigning to an expression in an index
    log_content[serialized_event.len()] = Event::get_event_type_id().to_field();

    context.emit_public_log(log_content);
}

pub trait EventInterface {
    fn get_event_type_id() -> EventSelector;
}
