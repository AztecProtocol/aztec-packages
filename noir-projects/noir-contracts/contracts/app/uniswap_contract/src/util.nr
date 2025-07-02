// docs:start:uniswap_public_content_hash
use dep::aztec::protocol_types::{
    address::{AztecAddress, EthAddress},
    hash::sha256_to_field,
    traits::ToField,
};

// This method computes the L2 to L1 message content hash for the public
// refer `l1-contracts/test/portals/UniswapPortal.sol` on how L2 to L1 message is expected
pub fn compute_swap_public_content_hash(
    input_asset_bridge_portal_address: EthAddress,
    input_amount: u128,
    uniswap_fee_tier: Field,
    output_asset_bridge_portal_address: EthAddress,
    minimum_output_amount: u128,
    aztec_recipient: AztecAddress,
    secret_hash_for_L1_to_l2_message: Field,
    caller_on_L1: EthAddress,
) -> Field {
    let mut hash_bytes = [0; 260]; // 8 fields of 32 bytes each + 4 bytes fn selector
    let input_token_portal_bytes: [u8; 32] =
        input_asset_bridge_portal_address.to_field().to_be_bytes();
    let in_amount_bytes: [u8; 32] = input_amount.to_field().to_be_bytes();
    let uniswap_fee_tier_bytes: [u8; 32] = uniswap_fee_tier.to_be_bytes();
    let output_token_portal_bytes: [u8; 32] =
        output_asset_bridge_portal_address.to_field().to_be_bytes();
    let amount_out_min_bytes: [u8; 32] = minimum_output_amount.to_field().to_be_bytes();
    let aztec_recipient_bytes: [u8; 32] = aztec_recipient.to_field().to_be_bytes();
    let secret_hash_for_L1_to_l2_message_bytes: [u8; 32] =
        secret_hash_for_L1_to_l2_message.to_be_bytes();
    let caller_on_L1_bytes: [u8; 32] = caller_on_L1.to_field().to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector = comptime {
        keccak256::keccak256(
            "swap_public(address,uint256,uint24,address,uint256,bytes32,bytes32,address)".as_bytes(),
            75,
        )
    };

    hash_bytes[0] = selector[0];
    hash_bytes[1] = selector[1];
    hash_bytes[2] = selector[2];
    hash_bytes[3] = selector[3];

    for i in 0..32 {
        hash_bytes[i + 4] = input_token_portal_bytes[i];
        hash_bytes[i + 36] = in_amount_bytes[i];
        hash_bytes[i + 68] = uniswap_fee_tier_bytes[i];
        hash_bytes[i + 100] = output_token_portal_bytes[i];
        hash_bytes[i + 132] = amount_out_min_bytes[i];
        hash_bytes[i + 164] = aztec_recipient_bytes[i];
        hash_bytes[i + 196] = secret_hash_for_L1_to_l2_message_bytes[i];
        hash_bytes[i + 228] = caller_on_L1_bytes[i];
    }

    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
// docs:end:uniswap_public_content_hash

// docs:start:compute_swap_private_content_hash
// This method computes the L2 to L1 message content hash for the private
// refer `l1-contracts/test/portals/UniswapPortal.sol` on how L2 to L1 message is expected
pub fn compute_swap_private_content_hash(
    input_asset_bridge_portal_address: EthAddress,
    input_amount: u128,
    uniswap_fee_tier: Field,
    output_asset_bridge_portal_address: EthAddress,
    minimum_output_amount: u128,
    secret_hash_for_L1_to_l2_message: Field,
    caller_on_L1: EthAddress,
) -> Field {
    let mut hash_bytes = [0; 228]; // 7 fields of 32 bytes each + 4 bytes fn selector
    let input_token_portal_bytes: [u8; 32] =
        input_asset_bridge_portal_address.to_field().to_be_bytes();
    let in_amount_bytes: [u8; 32] = input_amount.to_field().to_be_bytes();
    let uniswap_fee_tier_bytes: [u8; 32] = uniswap_fee_tier.to_be_bytes();
    let output_token_portal_bytes: [u8; 32] =
        output_asset_bridge_portal_address.to_field().to_be_bytes();
    let amount_out_min_bytes: [u8; 32] = minimum_output_amount.to_field().to_be_bytes();
    let secret_hash_for_L1_to_l2_message_bytes: [u8; 32] =
        secret_hash_for_L1_to_l2_message.to_be_bytes();
    let caller_on_L1_bytes: [u8; 32] = caller_on_L1.to_field().to_be_bytes();

    // The purpose of including the following selector is to make the message unique to that specific call. Note that
    // it has nothing to do with calling the function.
    let selector = comptime {
        keccak256::keccak256(
            "swap_private(address,uint256,uint24,address,uint256,bytes32,address)".as_bytes(),
            68,
        )
    };

    hash_bytes[0] = selector[0];
    hash_bytes[1] = selector[1];
    hash_bytes[2] = selector[2];
    hash_bytes[3] = selector[3];

    for i in 0..32 {
        hash_bytes[i + 4] = input_token_portal_bytes[i];
        hash_bytes[i + 36] = in_amount_bytes[i];
        hash_bytes[i + 68] = uniswap_fee_tier_bytes[i];
        hash_bytes[i + 100] = output_token_portal_bytes[i];
        hash_bytes[i + 132] = amount_out_min_bytes[i];
        hash_bytes[i + 164] = secret_hash_for_L1_to_l2_message_bytes[i];
        hash_bytes[i + 196] = caller_on_L1_bytes[i];
    }
    let content_hash = sha256_to_field(hash_bytes);
    content_hash
}
// docs:end:compute_swap_private_content_hash
