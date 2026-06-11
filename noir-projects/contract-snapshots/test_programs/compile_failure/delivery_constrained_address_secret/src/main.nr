use aztec::macros::aztec;

#[aztec]
contract DeliveryConstrainedAddressSecret {
    use aztec::{
        macros::functions::external,
        messages::delivery::MessageDelivery,
    };

    #[external("private")]
    fn build_delivery() {
        let mut delivery = MessageDelivery::onchain_constrained().with_sender(self.msg_sender());
        let _ = delivery.via_address_derived_secret();
    }
}
