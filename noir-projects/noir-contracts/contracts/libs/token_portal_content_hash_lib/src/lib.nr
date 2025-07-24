// docs:start:mint_to_public_content_hash_nr
use dep::aztec::protocol_types::{address::{AztecAddress, EthAddress}, hash::sha256_to_field, traits::ToField};

// Computes a content hash of a deposit/mint_to_public message.
// Refer TokenPortal.sol for reference on L1.
pub fn get_mint_to_public_content_hash(owner: AztecAddress, amount: u128) -> Field {
    let mut hash_bytes = [0; 68];
    let recipient_bytes: [u8; 32] = owner.to_field().to_be_bytes();
    let amount_bytes: [u8; 32] = (amount as Field).to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector =
        comptime { keccak256::keccak256("mint_to_public(bytes32,uint256)".as_bytes(), 31) };

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
// docs:end:mint_to_public_content_hash_nr

// docs:start:get_mint_to_private_content_hash
// Computes a content hash of a deposit/mint_to_private message.
// Refer TokenPortal.sol for reference on L1.
pub fn get_mint_to_private_content_hash(amount: u128) -> Field {
    let mut hash_bytes = [0; 36];
    let amount_bytes: [u8; 32] = (amount as Field).to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector = comptime { keccak256::keccak256("mint_to_private(uint256)".as_bytes(), 24) };

    for i in 0..4 {
        hash_bytes[i] = selector[i];
    }

    for i in 0..32 {
        hash_bytes[i + 4] = amount_bytes[i];
    }

    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
// docs:end:get_mint_to_private_content_hash

// docs:start:get_withdraw_content_hash
// Computes a content hash of a withdraw message.
pub fn get_withdraw_content_hash(
    recipient: EthAddress,
    amount: u128,
    caller_on_l1: EthAddress,
) -> Field {
    // Compute the content hash
    // Compute sha256(selector || amount || recipient)
    // then convert to a single field element
    // add that to the l2 to l1 messages
    let mut hash_bytes: [u8; 100] = [0; 100];
    let recipient_bytes: [u8; 32] = recipient.to_field().to_be_bytes();
    let amount_bytes: [u8; 32] = (amount as Field).to_be_bytes();
    let caller_on_l1_bytes: [u8; 32] = caller_on_l1.to_field().to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector =
        comptime { keccak256::keccak256("withdraw(address,uint256,address)".as_bytes(), 33) };

    for i in 0..4 {
        hash_bytes[i] = selector[i];
    }

    for i in 0..32 {
        hash_bytes[i + 4] = recipient_bytes[i];
        hash_bytes[i + 36] = amount_bytes[i];
        hash_bytes[i + 68] = caller_on_l1_bytes[i];
    }
    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
// docs:end:get_withdraw_content_hash
