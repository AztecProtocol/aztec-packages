use crate::{
    context::PrivateContext,
    event::{event_emission::NewEvent, event_interface::EventInterface},
    messages::{
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        logs::{event::encode_private_event_message, utils::prefix_with_tag},
        message_delivery::MessageDelivery,
        offchain_messages::deliver_offchain_message,
    },
    utils::remove_constraints::remove_constraints_if,
};
use protocol_types::{address::AztecAddress, traits::Serialize};

/// A message with information about an event that was emitted in the current contract call. This message **MUST** be
/// delivered to a recipient in order to not lose the private event information.
///
/// Use [EventMessage::deliver_to] to select a delivery mechanism.
#[must_use = "Unused EventMessage result - use the `deliver_to` function to prevent the event information from being lost forever"]
pub struct EventMessage<Event> {
    pub(crate) new_event: NewEvent<Event>,

    // EventMessage is constructed when an event is emitted, which means that the `context` object will be in scope. By
    // storing a reference to it inside this object we remove the need for its methods to receive it, resulting in a
    // cleaner end-user API.
    context: &mut PrivateContext,
}

impl<Event> EventMessage<Event>
where
    Event: EventInterface + Serialize,
{
    pub(crate) fn new(new_event: NewEvent<Event>, context: &mut PrivateContext) -> Self {
        Self { new_event, context }
    }

    /// Delivers the event message to a `recipient`, providing them access to the private event information.
    ///
    /// The same message can be delivered to multiple recipients, resulting in all of them learning about the event. Any
    /// recipient that receives the private event information will be able to prove its emission - events have no owner,
    /// and as such all recipients are treated equally.
    ///
    /// The message is first encrypted to the recipient's public key, ensuring no other actor can read it.
    ///
    /// The `delivery_mode` must be one of [crate::messages::message_delivery::MessageDeliveryEnum], and will inform
    /// costs (both proving time and TX fees) as well as delivery guarantees. This value must be a compile-time
    /// constant.
    ///
    /// # Invalid Recipients
    ///
    /// If `recipient` is an invalid address, then a random public key is selected and message delivery continues as
    /// normal. This prevents both 'king of the hill' attacks (where a sender would otherwise fail to deliver a message
    /// to an invalid recipient) and forced privacy leaks (where an invalid recipient results in a unique transaction
    /// fingerprint, e.g. one lacking the private logs that would correspond to message delivery).
    pub fn deliver_to(self, recipient: AztecAddress, delivery_mode: u8) {
        // This function relies on `delivery_mode` being a constant in order to reduce circuit constraints when
        // unconstrained usage is requested. If `delivery_mode` were a runtime value the compiler would be unable to
        // perform dead-code elimination.
        assert_constant(delivery_mode);

        // The following maps out the 3 dimensions across which we configure message delivery.
        let constrained_encryption = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;
        let deliver_as_offchain_message = delivery_mode == MessageDelivery.UNCONSTRAINED_OFFCHAIN;
        // TODO(#14565): Add constrained tagging
        let _constrained_tagging = delivery_mode == MessageDelivery.CONSTRAINED_ONCHAIN;

        // Technical note: we're about to call a closure that needs access to `new_event`, but we can't pass `self` to
        // it because the closure might execute in unconstrained mode, and since `self` contains a mutable reference to
        // `context` this would cause for a mutable reference to cross the constrained-unconstrained barrier, which is
        // not allowed. As a workaround, we create a variable without the context and capture that instead.
        let new_event = self.new_event;

        let ciphertext = remove_constraints_if(
            !constrained_encryption,
            || AES128::encrypt(
                encode_private_event_message(new_event.event, new_event.randomness),
                recipient,
            ),
        );

        if deliver_as_offchain_message {
            deliver_offchain_message(ciphertext, recipient);
        } else {
            // Safety: Currently unsafe. See description of CONSTRAINED_ONCHAIN in MessageDeliveryEnum.
            // TODO(#14565): Implement proper constrained tag prefixing to make this truly CONSTRAINED_ONCHAIN
            let log_content = prefix_with_tag(ciphertext, recipient);

            self.context.emit_private_log(log_content, log_content.len());
        }
    }
}
