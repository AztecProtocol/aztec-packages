use crate::{
    context::PrivateContext,
    event::{event_emission::NewEvent, event_interface::EventInterface},
    messages::{
        logs::event::encode_private_event_message, message_delivery::do_private_message_delivery,
    },
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
        // Technical note: we're about to call a closure that needs access to `new_event`, but we can't pass `self` to it
        // because the closure might execute in unconstrained mode, and since `self` contains a mutable reference to
        // `context` this would cause for a mutable reference to cross the constrained-unconstrained barrier, which is
        // not allowed. As a workaround, we create a variable without the context and capture that instead.
        let new_event = self.new_event;

        do_private_message_delivery(
            self.context,
            || encode_private_event_message(new_event.event, new_event.randomness),
            Option::none(),
            recipient,
            delivery_mode,
        );
    }
}
