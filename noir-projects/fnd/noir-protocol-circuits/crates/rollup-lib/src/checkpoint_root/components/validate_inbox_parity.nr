use crate::abis::ParityPublicInputs;
use types::{
    constants::{INBOX_PARITY_1024_VK_INDEX, INBOX_PARITY_256_VK_INDEX, INBOX_PARITY_64_VK_INDEX},
    proof::proof_data::UltraHonkProofData,
};

/// Verify the checkpoint's `InboxParity` proof and vk, and check that its vk tree root and prover_id equal the ones in
/// the checkpoint's constants. The proof may be any rung of the size ladder, so the vk index is checked against the
/// allowed `{64, 256, 1024}` set rather than a single value.
pub fn validate_inbox_parity(
    data: UltraHonkProofData<ParityPublicInputs>,
    vk_tree_root: Field,
    prover_id: Field,
) {
    if !::std::runtime::is_unconstrained() {
        data.verify_proof();
    }

    // Check that the `vk_tree_root` in the public inputs matches the one in the checkpoint's constants, as it was used
    // to verify the vk of the inbox parity proof.
    assert_eq(
        data.public_inputs.vk_tree_root,
        vk_tree_root,
        "The vk tree root of the inbox parity does not match the rollup's vk tree root",
    );

    // Check that the `prover_id` in the public inputs matches the one in the checkpoint's constants, preventing sybil
    // attacks where the same prover submits an inbox parity proof under different identities.
    assert_eq(
        data.public_inputs.prover_id,
        prover_id,
        "The prover id of the inbox parity does not match the rollup's prover id",
    );

    // The proof may be any rung of the size ladder, so accept the whole `{64, 256, 1024}` vk-index set.
    data.vk_data.validate_allowed_in_vk_tree(
        vk_tree_root,
        [INBOX_PARITY_64_VK_INDEX, INBOX_PARITY_256_VK_INDEX, INBOX_PARITY_1024_VK_INDEX],
    );
}
