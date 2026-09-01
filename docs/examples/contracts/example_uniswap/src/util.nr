// docs:start:swap_public_content_hash
use aztec::protocol::{address::{AztecAddress, EthAddress}, hash::sha256_to_field, traits::ToField};

// Hash byte sizes: number of fields x 32 bytes + 4 byte selector
// Public: 7 fields (input portal, amount, fee, output portal, min output, recipient, secret hash)
global PUBLIC_SWAP_HASH_SIZE: u32 = 228;
// Private: 6 fields (no recipient - implicit from sender for privacy)
global PRIVATE_SWAP_HASH_SIZE: u32 = 196;

// Computes the L2 to L1 message content hash for the public swap flow.
// Must match the hash computed in ExampleUniswapPortal.sol on L1.
pub fn compute_swap_public_content_hash(
    input_asset_bridge_portal_address: EthAddress,
    input_amount: u128,
    uniswap_fee_tier: Field,
    output_asset_bridge_portal_address: EthAddress,
    minimum_output_amount: u128,
    aztec_recipient: AztecAddress,
    secret_hash_for_L1_to_l2_message: Field,
) -> Field {
    let mut hash_bytes = [0; PUBLIC_SWAP_HASH_SIZE];
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

    // The function selector makes the message unique to this specific call type.
    let selector = comptime {
        keccak256::keccak256(
            "swap_public(address,uint256,uint24,address,uint256,bytes32,bytes32)".as_bytes(),
            67,
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
    }

    sha256_to_field(hash_bytes)
}
// docs:end:swap_public_content_hash

// docs:start:swap_private_content_hash
// Computes the L2 to L1 message content hash for the private swap flow.
// Must match the hash computed in ExampleUniswapPortal.sol on L1.
pub fn compute_swap_private_content_hash(
    input_asset_bridge_portal_address: EthAddress,
    input_amount: u128,
    uniswap_fee_tier: Field,
    output_asset_bridge_portal_address: EthAddress,
    minimum_output_amount: u128,
    secret_hash_for_L1_to_l2_message: Field,
) -> Field {
    let mut hash_bytes = [0; PRIVATE_SWAP_HASH_SIZE];
    let input_token_portal_bytes: [u8; 32] =
        input_asset_bridge_portal_address.to_field().to_be_bytes();
    let in_amount_bytes: [u8; 32] = input_amount.to_field().to_be_bytes();
    let uniswap_fee_tier_bytes: [u8; 32] = uniswap_fee_tier.to_be_bytes();
    let output_token_portal_bytes: [u8; 32] =
        output_asset_bridge_portal_address.to_field().to_be_bytes();
    let amount_out_min_bytes: [u8; 32] = minimum_output_amount.to_field().to_be_bytes();
    let secret_hash_for_L1_to_l2_message_bytes: [u8; 32] =
        secret_hash_for_L1_to_l2_message.to_be_bytes();

    // The function selector makes the message unique to this specific call type.
    let selector = comptime {
        keccak256::keccak256(
            "swap_private(address,uint256,uint24,address,uint256,bytes32)".as_bytes(),
            60,
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
    }

    sha256_to_field(hash_bytes)
}
// docs:end:swap_private_content_hash
