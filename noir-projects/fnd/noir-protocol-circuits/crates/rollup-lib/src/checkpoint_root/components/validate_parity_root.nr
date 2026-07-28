use crate::abis::ParityPublicInputs;
use types::{constants::PARITY_ROOT_VK_INDEX, proof::proof_data::UltraHonkProofData};

/// Verify the parity root proof and vk, and check that its vk tree root and prover_id equal the ones in the
/// checkpoint's constants.
pub fn validate_parity_root(
    data: UltraHonkProofData<ParityPublicInputs>,
    vk_tree_root: Field,
    prover_id: Field,
) {
    if !::std::runtime::is_unconstrained() {
        data.verify_proof();
    }

    assert_eq(data.vk_data.leaf_index, PARITY_ROOT_VK_INDEX, "Incorrect vk index for parity root");

    // Check that the `vk_tree_root` in the public inputs matches the one in the checkpoint's constants, as it was used
    // to verify the vk of the base parity proofs.
    assert_eq(
        data.public_inputs.vk_tree_root,
        vk_tree_root,
        "The vk tree root of the parity root does not match the rollup's vk tree root",
    );

    // Check that the `prover_id` in the public inputs matches the one in the checkpoint's constants, preventing sybil
    // attacks where the same prover submits a parity root proof under different identities.
    assert_eq(
        data.public_inputs.prover_id,
        prover_id,
        "The prover id of the parity root does not match the rollup's prover id",
    );

    data.vk_data.validate_in_vk_tree(vk_tree_root);
}
