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

/// Specifies the configuration parameters for message delivery. There are two fundamental aspects to consider:
///
/// +----------------------------------------------------------------------------------------------------------+
/// | 1. Delivery Mechanism                                                                                    |
/// | - Messages can be delivered either on-chain or out-of-band                                               |
/// | - On-chain delivery uses the Aztec protocol's private log stream, submitted to L1 blobs and consuming DA |
/// | - Out-of-band delivery is implemented by the application (e.g. storing ciphertexts in cloud storage)     |
/// | - Out-of-band delivery cannot have any cryptographic constraints since messages are never stored on-chain|
/// +----------------------------------------------------------------------------------------------------------+
///
/// For on-chain delivery, we must also consider:
///
/// +----------------------------------------------------------------------------------------------------------+
/// | 2. Message Encryption and Tagging                                                                        |
/// | - Messages can use either constrained or unconstrained encryption                                        |
/// | - Constrained encryption guarantees the ciphertext is formed correctly but costs more in constraints,    |
/// |   which results in slower proving times                                                                  |
/// | - Unconstrained encryption trusts the sender but is cheaper constraint-wise and hence faster to prove    |
/// | - Tagging is an indexing mechanism that helps recipients locate their messages                           |
/// | - If tagging is not performed correctly by the sender, the recipient will not be able to find the message|
/// +----------------------------------------------------------------------------------------------------------+
///
/// For off-chain delivery, constrained encryption is not relevant since it doesn't provide any additional guarantees
/// over unconstrained encryption and is slower to prove (requiring more constraints).
///
/// There are three available delivery modes described below.
pub struct MessageDeliveryEnum {
    /// 1. Constrained On-chain
    /// - Uses constrained encryption and in the future constrained tagging (issue #14565) with on-chain delivery
    /// - Provides cryptographic guarantees that recipients can discover and decrypt messages (once #14565 is tackled)
    /// - Slowest proving times since encryption is constrained
    /// - Expensive since it consumes L1 blob space
    /// - Use when smart contracts need to make decisions based on message contents
    /// - Example 1: An escrow contract facilitating a private NFT sale that needs to verify payment before releasing
    ///   the NFT to the buyer.
    /// - Example 2: An application with private configuration where changes must be broadcast to all participants.
    ///   This ensures every user can access the latest configuration. Without notification of config changes,
    ///   users would be unable to read updated variables and therefore blocked from using the application's
    ///   functions. This pattern applies to all critical events that require universal broadcast.
    ///
    /// Safety: Despite being called CONSTRAINED_ONCHAIN, this delivery mode is currently NOT fully constrained.
    /// The tag prefixing is unconstrained, meaning a malicious sender could manipulate the tag to prevent
    /// recipient decryption. TODO(#14565): Implement proper constrained tag prefixing.
    pub CONSTRAINED_ONCHAIN: u8,

    /// 2. Unconstrained On-chain
    /// - Uses unconstrained encryption and tagging with on-chain delivery
    /// - Faster proving times since no constraints are used for encryption
    /// - Expensive since it consumes L1 blob space
    /// - Suitable when recipients can verify message validity through other means
    /// - Use this if you don't need the cryptographic guarantees of constrained encryption and tagging but
    ///   don't want to deal with setting up out-of-band delivery infrastructure as required by mode 3
    /// - Example: Depositing a privately-held NFT into an NFT-sale escrow contract. The buyers know the escrow
    ///   contract's decryption keys, they receive the message on-chain and are willing to buy the NFT only if the NFT
    ///   contained in the message is legitimate.
    pub UNCONSTRAINED_ONCHAIN: u8,

    /// 3. Out-of-band
    /// - Uses unconstrained encryption with off-chain delivery
    /// - Lowest cost since no on-chain storage is needed and short proving times since no constraints are used
    ///   for encryption
    /// - Suitable when recipients can verify message validity through other means
    /// - Requires setting up custom infrastructure for handling off-chain delivery (e.g. cloud storage)
    /// - Example: A payment app where a merchant receives the message off-chain and is willing to release the goods
    ///   once he verifies that the payment is correct (i.e. can decrypt the message and verify that it contains
    ///   a legitimate token note - note with note commitment in the note hash tree).
    pub UNCONSTRAINED_OFFCHAIN: u8,
}

pub global MessageDelivery: MessageDeliveryEnum = MessageDeliveryEnum {
    CONSTRAINED_ONCHAIN: 1,
    UNCONSTRAINED_ONCHAIN: 2,
    UNCONSTRAINED_OFFCHAIN: 3,
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
        // Safety: Offchain messages are by definition unconstrained. They are emitted via the `emit_offchain_effect`
        // oracle which we don't use for anything besides its side effects, therefore this is safe to call.
        unsafe { emit_offchain_message(ciphertext, recipient) };
    } else {
        // Safety: Currently unsafe. See description of CONSTRAINED_ONCHAIN in MessageDeliveryEnum.
        // TODO(#14565): Implement proper constrained tag prefixing to make this truly CONSTRAINED_ONCHAIN
        let log_content = prefix_with_tag(ciphertext, recipient);

        context.emit_private_log(log_content, log_content.len());
    }
}

// TODO(benesjan): rename to emit_event_in_public
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
