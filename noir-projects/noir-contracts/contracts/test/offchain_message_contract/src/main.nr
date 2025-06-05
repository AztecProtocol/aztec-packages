use aztec::macros::aztec;

/// This contract is used to test that emitting offchain messages works correctly.
#[aztec]
contract OffchainMessage {
    use aztec::{
        macros::functions::private, oracle::offchain_message::emit_offchain_message,
        prelude::AztecAddress,
    };

    #[private]
    fn emit_offchain_message_for_recipient(message: [Field; 5], recipient: AztecAddress) {
        emit_offchain_message(message, recipient);
    }
}
