use crate::{
    context::{PrivateContext, PublicContext},
    event::event_selector::EventSelector,
    messages::{
        logs::{event::to_encrypted_private_event_message, utils::prefix_with_tag},
        offchain_messages::emit_offchain_message,
    },
    utils::remove_constraints::{remove_constraints, remove_constraints_if},
};
use dep::protocol_types::{
    address::AztecAddress,
    constants::GENERATOR_INDEX__EVENT_COMMITMENT,
    hash::poseidon2_hash_with_separator,
    traits::{Serialize, ToField},
};

/// Specifies the configuration parameters for message emission across three key dimensions:
///
/// 1. Constrained or unconstrained encryption
/// - When the encryption is constrained we have a guarantee that the resulting ciphertext is formed correctly. If we
///   don't need this guarantee and we are fine with trusting the sender it has been done correctly, it is recommended
///   to use unconstrained encryption.
/// - Note that we always commit to the plaintext and the recipient is therefore always able to verify the authenticity
///   of the message.
///
/// 2. Delivery mechanism
/// - The message ciphertext can be delivered either via the private log stream or as an offchain message.
/// - The private log stream is handled by the Aztec protocol, is submitted to L1 blobs and consumes DA.
/// - The offchain message mechanism is implemented by the app and hence is not expected to consume DA (e.g. imagine
///   an app submitting all the ciphertext to cloud storage).
///
/// 3. Constrained or unconstrained tagging
/// - Tagging is a mechanism to ensure that a recipient is able to efficiently find a private log (tagging is not used
/// in the offchain message mechanism). If the tagging is unconstrained we don't have a guarantee that it was performed
/// correctly and hence we don't have a guarantee that the recipient is able to find the message. Use unconstrained
/// tagging only when the recipient is trusted or is incentivised to deliver the message.
///
///
/// # When to use which variant
/// - We are currently still exploring the design space but it seems that there are only 2 meaningful combinations:
///
/// 1. Constrained encryption, constrained tagging, private log stream
///
/// This combination gives us an on-chain guarantee that a recipient is able to discovery and receive a message. This
/// is to be used when a smart contract (rather than a person) needs to make decisions based on the message. For
/// example, consider a contract that escrows a privately-stored NFT (i.e. an NFT represented by a note) and releases
/// it to a buyer only after receiving a payment in a specific token. Without on-chain delivery and guaranteed
/// discoverability afforded by constrained tagging, the buyer could potentially obtain the NFT without sending the
/// payment token message (the note hash preimage) to the seller, rugging the seller.
///
/// (To clarify the above, while the malicious buyer's payment token would still be deducted from their balance, they
/// would obtain the NFT while the seller would be unable to spend the payment token, keeping the payment token note
/// in limbo.)
///
/// 2. Unconstrained encryption, offchain message
/// This combination is useful when we either trust the sender to behave or the sender is incentivised to deliver the
/// message. Let's consider a payment app. When you are buying groceries, the merchant can consider the payment
/// successful once he receives the payment message, can successfully decrypt it and see that its contents correspond
/// to a valid token note.
///
///
/// Other combinations like unconstrained encryption, unconstrained tagging, private log stream don't seem to be
/// meaningful because they are way costlier that combination 2 above while providing no additional guarantees.
pub struct PrivateLogContentConstraintsEnum {
    /// The contents of the log are entirely unconstrained, and could have any values. The log is delivered via
    /// the private log stream and hence is submitted to L1 blobs and consumes DA.
    ///
    /// Only use in scenarios where the recipient not receiving the message is an acceptable outcome (e.g. because the
    /// sender is somehow motivated to ensure the recipient learns of it).
    pub NO_CONSTRAINTS: u8,
    /// The contents of the log and its encryption are constrained. The tag (and therefore whether the recipient is
    /// actually able to find the message) is not. The log is delivered via the private log stream and hence is
    /// submitted to L1 blobs and consumes DA.
    ///
    /// Only use in scenarios where the recipient not receiving the message is an acceptable outcome (e.g. because the
    /// sender is somehow motivated to ensure the recipient learns of it).
    // TODO(#14565): This variant requires for tagging to also be constrained, as it is otherwise useless.
    pub CONSTRAINED_ENCRYPTION: u8,
    /// The contents of the log are entirely unconstrained, and could have any values. The log is delivered via
    /// the offchain message mechanism and hence is not submitted to L1 blobs and does not consume DA.
    ///
    /// Only use in scenarios where the recipient not receiving the message is an acceptable outcome (e.g. because the
    /// sender is somehow motivated to ensure the recipient learns of it). The offchain message mechanism is not
    /// guaranteed to deliver the message and it's up to the app to deliver the message to the recipient.
    ///
    /// For more details on offchain messages, see the documentation for the `emit_offchain_message` function in
    /// `aztec-nr/aztec/src/messages/offchain_messages.nr`.
    pub OFFCHAIN_MESSAGE: u8,
}

pub global PrivateLogContent: PrivateLogContentConstraintsEnum = PrivateLogContentConstraintsEnum {
    NO_CONSTRAINTS: 1,
    CONSTRAINED_ENCRYPTION: 2,
    OFFCHAIN_MESSAGE: 3,
    // TODO: add constrained tagging and constrained handshaking
};

/// Emits an event in a private log, encrypting it such that only `recipient` will learn of its contents. The log will
/// be tagged using a shared secret between `sender` and `recipient`, so that `recipient` can efficiently find the log.
///
/// The `constraints` value determines what parts of this computation will be constrained. See the documentation for
/// each value in `PrivateLogContentConstraintsEnum` to learn more about the different variants.
pub fn emit_event_in_private_log<Event>(
    event: Event,
    context: &mut PrivateContext,
    recipient: AztecAddress,
    constraints: u8,
)
where
    Event: EventInterface + Serialize,
{
    // This function relies on `constraints` being a constant in order to reduce circuit constraints when unconstrained
    // usage is requested. If `constraints` were a runtime value then performance would suffer.
    assert_constant(constraints);

    let (ciphertext, randomness) = remove_constraints_if(
        constraints == PrivateLogContent.NO_CONSTRAINTS,
        || to_encrypted_private_event_message(event, recipient),
    );
    let log_content = prefix_with_tag(ciphertext, recipient);

    // We generate a cryptographic commitment to the event to ensure its authenticity during out-of-band delivery.
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

    context.emit_private_log(log_content, log_content.len());
}

/// Emits an event as an offchain message. Similar to private log emission but uses offchain message mechanism instead.
///
/// Unlike private log emission, encryption here is always unconstrained. This design choice stems from the nature of
/// offchain messages - they lack guaranteed delivery, unlike private logs. Without delivery guarantees, smart
/// contracts cannot make assumptions about a message being delivered, making constrained encryption unnecessary.
/// However, message integrity remains protected through a cryptographic commitment stored in the nullifier tree,
/// preventing tampering even in the absence of guaranteed delivery. See the description of the
/// `messages::offchain_message::emit_offchain_message` function for more details on when a guaranteed delivery is
/// valuable. If guaranteed delivery is required, the `emit_event_in_private_log` function should be used instead.
pub fn emit_event_as_offchain_message<Event>(
    event: Event,
    context: &mut PrivateContext,
    recipient: AztecAddress,
)
where
    Event: EventInterface + Serialize,
{
    // Safety: as explained above, this function places no constraints on the content of the message.
    let (message_ciphertext, randomness) =
        unsafe { remove_constraints(|| to_encrypted_private_event_message(event, recipient)) };

    // We generate a cryptographic commitment to the event to ensure its authenticity during out-of-band delivery. Note
    // that the commitment is made from the (constrained) event content, and not the (unconstrained) ciphertext.
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

    // Safety: Offchain effects are by definition unconstrained. They are emitted via an oracle
    // which we don't use for anything besides its side effects, therefore this is safe to call.
    unsafe { emit_offchain_message(message_ciphertext, recipient) };
}

pub fn emit_event_in_public_log<Event>(event: Event, context: &mut PublicContext)
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

pub trait EventInterface {
    fn get_event_type_id() -> EventSelector;
}
