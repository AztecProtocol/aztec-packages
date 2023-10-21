use dep::aztec::hash::sha256_to_field;
use dep::aztec::types::address::EthereumAddress;

pub fn compute_content_hash(
    pool_id: Field,
    whom: EthereumAddress,
    amount: Field,
    caller_on_L1: EthereumAddress,
) -> Field {
    let mut hash_bytes: [u8; 132] = [0; 132]; // 4 fields of 32 bytes each + 4 bytes fn selector

    // 0x25fb2680 = sig of "donate(uint256,address,uint256)"
    hash_bytes[0] = 0x25;
    hash_bytes[1] = 0xfb;
    hash_bytes[2] = 0x26;
    hash_bytes[3] = 0x80;

    let pool_id_bytes = pool_id.to_be_bytes(32);
    let whom_bytes = whom.address.to_be_bytes(32);
    let amount_bytes = amount.to_be_bytes(32);
    let caller_on_L1_bytes = caller_on_L1.address.to_be_bytes(32);

    for i in 0..32 {
        hash_bytes[i + 4] = pool_id_bytes[i];
        hash_bytes[i + 36] = whom_bytes[i];
        hash_bytes[i + 68] = amount_bytes[i];
        hash_bytes[i + 100] = caller_on_L1_bytes[i];
    }
    
    sha256_to_field(hash_bytes)
}