use dep::aztec::context::PublicContext;
use dep::aztec::prelude::AztecAddress;
use dep::aztec::protocol_types::hash::sha256_to_field;

pub fn calculate_fee<TPublicContext>(context: PublicContext) -> Field {
    context.transaction_fee()
}

pub fn get_bridge_gas_msg_hash(owner: AztecAddress, amount: U128) -> Field {
    let mut hash_bytes = [0; 68];
    let recipient_bytes: [u8; 32] = owner.to_field().to_be_bytes();
    let amount_bytes: [u8; 32] = amount.to_field().to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector = comptime { std::hash::keccak256("claim(bytes32,uint256)".as_bytes(), 22) };

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
