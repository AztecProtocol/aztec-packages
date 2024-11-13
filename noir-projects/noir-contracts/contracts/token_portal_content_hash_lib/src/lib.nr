// docs:start:mint_to_public_content_hash_nr
use dep::aztec::prelude::{AztecAddress, EthAddress};
use dep::aztec::protocol_types::hash::sha256_to_field;

// Computes a content hash of a deposit/mint_to_public message.
// Refer TokenPortal.sol for reference on L1.
pub fn get_mint_to_public_content_hash(owner: AztecAddress, amount: Field) -> Field {
    let mut hash_bytes = [0; 68];
    let recipient_bytes:[u8; 32] = owner.to_field().to_be_bytes();
    let amount_bytes:[u8; 32] = amount.to_be_bytes();

    for i in 0..32 {
        hash_bytes[i + 4] = recipient_bytes[i];
        hash_bytes[i + 36] = amount_bytes[i];
    }

    // Function selector: 0xbc6a9bd3 keccak256('mint_to_public(bytes32,uint256)')
    hash_bytes[0] = 0xbc;
    hash_bytes[1] = 0x6a;
    hash_bytes[2] = 0x9b;
    hash_bytes[3] = 0xd3;

    // let selector = comptime { std::hash::keccak256("mint_to_public(bytes32,uint256)".as_bytes(), 24) };

    // hash_bytes[0] = selector[0];
    // hash_bytes[1] = selector[1];
    // hash_bytes[2] = selector[2];
    // hash_bytes[3] = selector[3];

    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
// docs:end:mint_to_public_content_hash_nr

// docs:start:get_mint_to_private_content_hash
// Computes a content hash of a deposit/mint_to_private message.
// Refer TokenPortal.sol for reference on L1.
pub fn get_mint_to_private_content_hash(
    amount: Field
) -> Field {
    let mut hash_bytes = [0; 36];
    let amount_bytes:[u8; 32] = amount.to_be_bytes();

    for i in 0..32 {
        hash_bytes[i + 4] = amount_bytes[i];
    }

    // Function selector: 0x8b3af5e8 keccak256('mint_to_private(uint256)')
    hash_bytes[0] = 0x8b;
    hash_bytes[1] = 0x3a;
    hash_bytes[2] = 0xf5;
    hash_bytes[3] = 0xe8;

    let selector = comptime { std::hash::keccak256("mint_to_private(uint256)".as_bytes(), 24) };

    dep::aztec::oracle::debug_log::debug_log_format("snek: {0}, {1}, {2}, {3}", [selector[0] as Field, selector[1] as Field, selector[2] as Field, selector[3] as Field]);

    // assert(selector[0] == hash_bytes[0]);
    // assert(selector[1] == hash_bytes[1]);
    // assert(selector[2] == hash_bytes[2]);
    // assert(selector[3] == hash_bytes[3]);

    // hash_bytes[0] = selector[0];
    // hash_bytes[1] = selector[1];
    // hash_bytes[2] = selector[2];
    // hash_bytes[3] = selector[3];

    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
// docs:end:get_mint_to_private_content_hash

// docs:start:get_withdraw_content_hash
// Computes a content hash of a withdraw message.
pub fn get_withdraw_content_hash(recipient: EthAddress, amount: Field, caller_on_l1: EthAddress) -> Field {
    // Compute the content hash
    // Compute sha256(selector || amount || recipient)
    // then convert to a single field element
    // add that to the l2 to l1 messages
    let mut hash_bytes: [u8; 100] = [0; 100];
    let recipient_bytes: [u8; 32] = recipient.to_field().to_be_bytes();
    let amount_bytes: [u8; 32] = amount.to_be_bytes();
    let caller_on_l1_bytes: [u8; 32] = caller_on_l1.to_field().to_be_bytes();

    //  0x69328dec, selector for "withdraw(address,uint256,address)"
    hash_bytes[0] = 0x69;
    hash_bytes[1] = 0x32;
    hash_bytes[2] = 0x8d;
    hash_bytes[3] = 0xec;

    // let selector = comptime { std::hash::keccak256("withdraw(address,uint256,address)".as_bytes(), 24) };

    // hash_bytes[0] = selector[0];
    // hash_bytes[1] = selector[1];
    // hash_bytes[2] = selector[2];
    // hash_bytes[3] = selector[3];

    for i in 0..32 {
        hash_bytes[i + 4] = recipient_bytes[i];
        hash_bytes[i + 36] = amount_bytes[i];
        hash_bytes[i + 68] = caller_on_l1_bytes[i];
    }
    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
// docs:end:get_withdraw_content_hash
