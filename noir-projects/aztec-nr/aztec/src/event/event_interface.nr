use crate::{
    context::{PrivateContext, PublicContext},
    event::event_selector::EventSelector,
    messages::{
        logs::{event::to_encrypted_private_event_message, utils::prefix_with_tag},
        offchain_messages::emit_offchain_message,
    },
    utils::remove_constraints::remove_constraints_if,
};
use dep::protocol_types::{
    address::AztecAddress,
    constants::GENERATOR_INDEX__EVENT_COMMITMENT,
    hash::poseidon2_hash_with_separator,
    traits::{Serialize, ToField},
};

/// Specifies the configuration parameters for message delivery across three key dimensions:
///
/// +--------------------------------------------------------------------------------------------------------+
/// | 1. Constrained or unconstrained encryption                                                             |
/// | - When the encryption is constrained we have a guarantee that the resulting ciphertext is formed       |
/// |   correctly. If we don't need this guarantee and we are fine with trusting the sender, it is           |
/// |   recommended to use unconstrained encryption as it's cheaper constraint-wise.                         |
/// +--------------------------------------------------------------------------------------------------------+
///
/// +--------------------------------------------------------------------------------------------------------+
/// | 2. Delivery mechanism                                                                                  |
/// | - The message ciphertext can be delivered either via the private log stream or as an offchain message. |
/// | - The private log stream is handled by the Aztec protocol, is submitted to L1 blobs and consumes DA.   |
/// | - The offchain message mechanism is implemented by the app and hence is not expected to consume DA     |
/// |   (imagine an app submitting all the ciphertext to cloud storage).                                     |
/// +--------------------------------------------------------------------------------------------------------+
///
/// +--------------------------------------------------------------------------------------------------------+
/// | 3. Constrained or unconstrained tagging                                                                |
/// | - Tagging is an indexing mechanism that enables recipients to locate private logs in the system. When  |
/// |   tagging is unconstrained, there is not a cryptographic guarantee about it being performed correctly. |
/// |   This may prevent recipients from successfully discovering their messages. Therefore, unconstrained   |
/// |   tagging should only be used in scenarios where the recipient is trusted or has clear incentives to   |
/// |   ensure proper message delivery.                                                                      |
/// | - Tagging is not used in the offchain message mechanism.                                               |
/// +--------------------------------------------------------------------------------------------------------+
///
///
/// # Message authenticity
/// Note that we always commit to the plaintext and the recipient is therefore always able to verify
/// the authenticity of the message no matter the delivery mechanism.
///
///
/// # Message Delivery Variants and Their Use Cases
///
/// The following section outlines the recommended delivery variants and when to use each one.
/// Each variant represents a different tradeoff between security guarantees, gas costs, and trust
/// assumptions.
///
/// We are currently still exploring the design space but it seems that there are only 2 meaningful
/// combinations:
///
/// +--------------------------------------------------------------------------------------------------------+
/// | 1. Constrained encryption, constrained tagging, private log stream                                     |
/// |                                                                                                        |
/// | This combination gives us an on-chain guarantee that a recipient is able to discover, receive and      |
/// | decrypt a message. This is to be used when a smart contract (rather than a person or some offchain     |
/// | system) needs to make decisions based on the message. For example, consider a contract that escrows a  |
/// | privately-stored NFT (i.e. an NFT represented by a note) and releases it to a buyer only after         |
/// | receiving a payment in a specific token. Without on-chain delivery and guaranteed discoverability      |
/// | afforded by constrained tagging and encryption, the buyer could potentially obtain the NFT without     |
/// | sending a valid payment message (i.e. the token note hash preimage) to the seller, rugging the seller. |
/// |                                                                                                        |
/// | (To clarify the above, while the malicious buyer's payment token would still be deducted from their    |
/// | balance, they would obtain the NFT while the seller would be unable to spend the payment token,        |
/// | keeping the payment token note in limbo.)                                                              |
/// +--------------------------------------------------------------------------------------------------------+
///
/// +--------------------------------------------------------------------------------------------------------+
/// | 2. Unconstrained encryption, offchain message                                                          |
/// |                                                                                                        |
/// | This combination is useful when we either trust the sender to behave or the sender is incentivized to  |
/// | deliver the message. To give you an example let's consider a payment app. When you are buying          |
/// | groceries, the merchant can consider the payment successful once he receives the payment message, can  |
/// | successfully decrypt it and see that its contents correspond to a valid token note.                    |
/// +--------------------------------------------------------------------------------------------------------+
///
///
/// Other combinations like unconstrained encryption, unconstrained tagging, private log stream don't seem
/// to be meaningful because they are costlier than combination 2 above while providing no meaningful
/// additional guarantees.
pub struct MessageDeliveryEnum {
    /// Constrained encryption + constrained tagging + private log stream
    ///
    /// This gives us an on-chain guarantee that a recipient is able to discover and receive a message.
    /// Use when a smart contract needs to make decisions based on the message.
    pub CONSTRAINED_ONCHAIN: u8,

    /// Unconstrained encryption + offchain message
    ///
    /// Useful when we trust the sender or the sender is incentivized to deliver the message.
    /// The offchain message mechanism is not guaranteed to deliver the message and it's up to the app
    /// to deliver the message to the recipient.
    pub UNCONSTRAINED_OFFCHAIN: u8,

    /// Unconstrained encryption + unconstrained tagging + private log stream
    ///
    /// As mentioned above, this combination is not meaningful but we keep it here as it's currently used in the
    /// codebase.
    /// TODO: Consider dropping this.
    pub UNCONSTRAINED_ONCHAIN: u8,
}

pub global MessageDelivery: MessageDeliveryEnum = MessageDeliveryEnum {
    CONSTRAINED_ONCHAIN: 1,
    UNCONSTRAINED_OFFCHAIN: 2,
    UNCONSTRAINED_ONCHAIN: 3,
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
    let unconstrained_encryption = delivery_mode != MessageDelivery.CONSTRAINED_ONCHAIN;
    let emit_as_offchain_message = delivery_mode == MessageDelivery.UNCONSTRAINED_OFFCHAIN;
    // TODO(#14565): Add constrained tagging
    let _constrained_tagging = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;

    let (ciphertext, randomness) = remove_constraints_if(
        unconstrained_encryption,
        || to_encrypted_private_event_message(event, recipient),
    );

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

    if emit_as_offchain_message {
        // In the case of delivery via offchain message tagging is not used and the log content is the ciphertext
        // itself.
        let log_content = ciphertext;

        // Safety: Offchain messages are by definition unconstrained. They are emitted via the `emit_offchain_effect`
        // oracle which we don't use for anything besides its side effects, therefore this is safe to call.
        unsafe { emit_offchain_message(log_content, recipient) };
    } else {
        // When delivering through the private log stream, tagging is used so we must prefix the ciphertext with a tag.
        let log_content = prefix_with_tag(ciphertext, recipient);

        context.emit_private_log(log_content, log_content.len());
    }
}

// TODO: rename to emit_event_in_public
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
