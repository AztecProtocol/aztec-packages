use aztec::macros::aztec;

/// Emits invalid private messages that the recipient's PXE should handle gracefully (e.g. by silently dropping them)
/// rather than crashing the sync.
#[aztec]
contract InvalidMessage {
    use aztec::macros::functions::external;
    use aztec::messages::encoding::encode_message;
    use aztec::messages::message_delivery::{do_private_message_delivery, MessageDelivery};
    use aztec::messages::msg_type::PRIVATE_EVENT_MSG_TYPE_ID;
    use aztec::protocol::address::AztecAddress;

    /// Emits a properly encrypted event message with no matching commitment nullifier in the tx.
    #[external("private")]
    fn emit_fake_event_message(recipient: AztecAddress) {
        let bogus_event_type_id: u64 = 0xDEAD;
        let randomness: Field = 42;
        let msg_content = [randomness, 1, 2];

        let msg = encode_message(PRIVATE_EVENT_MSG_TYPE_ID, bogus_event_type_id, msg_content);
        do_private_message_delivery(
            self.context,
            || msg,
            Option::none(),
            recipient,
            MessageDelivery.ONCHAIN_UNCONSTRAINED,
        );
    }

    /// No-op private function used to trigger a contract sync in PXE without side effects.
    #[external("private")]
    fn noop() {}
}
