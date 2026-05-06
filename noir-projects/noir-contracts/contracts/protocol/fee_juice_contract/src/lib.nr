use aztec::context::PublicContext;
use aztec::protocol::address::AztecAddress;
use aztec::protocol::hash::sha256_to_field;
use aztec::protocol::traits::ToField;

pub fn calculate_fee<TPublicContext>(context: PublicContext) -> Field {
    context.transaction_fee()
}

/// Computes the content hash for an L1-to-L2 "bridge gas" message, matching the hash produced on L1 by
/// `FeeJuicePortal.depositToAztecPublic`: `sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", to,
/// amount))`.
///
/// The 68-byte buffer is: [4-byte selector of "claim(bytes32,uint256)"][32-byte recipient][32-byte amount], hashed
/// with `sha256_to_field` to produce a single Field.
pub fn get_bridge_gas_msg_hash(owner: AztecAddress, amount: u128) -> Field {
    let mut hash_bytes = [0; 68];
    let recipient_bytes: [u8; 32] = owner.to_field().to_be_bytes();
    let amount_bytes: [u8; 32] = (amount as Field).to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector = comptime { keccak256::keccak256("claim(bytes32,uint256)".as_bytes(), 22) };

    for i in 0..4 {
        hash_bytes[i] = selector[i];
    }

    for i in 0..32 {
        hash_bytes[i + 4] = recipient_bytes[i];
        hash_bytes[i + 36] = amount_bytes[i];
    }

    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
