use aztec::macros::aztec;

#[aztec]
contract DeliveryConstrainedWithoutSender {
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
            MessageDelivery::onchain_constrained(),
        );
    }
}
