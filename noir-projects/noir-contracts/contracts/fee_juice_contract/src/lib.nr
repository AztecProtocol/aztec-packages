use dep::aztec::context::PublicContext;
use dep::aztec::prelude::AztecAddress;
use dep::aztec::protocol_types::hash::sha256_to_field;

pub fn calculate_fee<TPublicContext>(context: PublicContext) -> Field {
    context.transaction_fee()
}

pub fn get_bridge_gas_msg_hash(owner: AztecAddress, amount: Field) -> Field {
    let mut hash_bytes = [0; 68];
    let recipient_bytes: [u8; 32] = owner.to_field().to_be_bytes();
    let amount_bytes: [u8; 32] = amount.to_be_bytes();

    for i in 0..32 {
        hash_bytes[i + 4] = recipient_bytes[i];
        hash_bytes[i + 36] = amount_bytes[i];
    }

    // Function selector: 0x63f44968 keccak256('claim(bytes32,uint256)')
    hash_bytes[0] = 0x63;
    hash_bytes[1] = 0xf4;
    hash_bytes[2] = 0x49;
    hash_bytes[3] = 0x68;

    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
