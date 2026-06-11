use aztec::macros::aztec;

#[aztec]
contract DeliveryUnconstrainedHandshake {
    use aztec::{
        macros::functions::external,
        messages::delivery::{do_private_message_delivery, MessageDelivery},
        protocol::address::AztecAddress,
    };

    #[external("private")]
    fn deliver(recipient: AztecAddress) {
        do_private_message_delivery(
            self.context,
            || [1],
            Option::none(),
            recipient,
            MessageDelivery::onchain_unconstrained()
                .with_sender(self.msg_sender())
                .via_non_interactive_handshake(),
        );
    }
}
