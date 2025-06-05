use aztec::macros::aztec;

/// This contract is used to test that emitting offchain messages works correctly.
#[aztec]
contract OffchainMessage {
    use aztec::{
        macros::functions::private, oracle::offchain_message::emit_offchain_message,
        prelude::AztecAddress,
    };

    #[private]
    fn emit_offchain_message_for_recipient(
        message: [Field; 5],
        recipient: AztecAddress,
        num_recursions: u8,
    ) {
        emit_offchain_message(message, recipient);

        if num_recursions > 0 {
            OffchainMessage::at(context.this_address())
                .emit_offchain_message_for_recipient(message, recipient, num_recursions - 1)
                .call(&mut context);
        }
    }
}
