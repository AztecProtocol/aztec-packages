use aztec::macros::aztec;

/// This contract is used to test that emitting offchain messages works correctly.
#[aztec]
contract OffchainMessage {
    use aztec::{
        macros::functions::private, oracle::offchain_message::emit_offchain_message,
        prelude::AztecAddress, protocol_types::traits::Serialize,
    };

    #[derive(Serialize)]
    pub struct MessagePayload {
        pub message: [Field; 5],
        pub recipient: AztecAddress,
        pub next_contract: AztecAddress,
    }

    #[private]
    fn emit_offchain_message_for_recipient(messages: BoundedVec<MessagePayload, 5>) {
        let mut messages = messages;
        let messagePayload = messages.pop();
        emit_offchain_message(messagePayload.message, messagePayload.recipient);

        if messages.len() > 0 {
            OffchainMessage::at(messagePayload.next_contract)
                .emit_offchain_message_for_recipient(messages)
                .call(&mut context);
        }
    }
}
