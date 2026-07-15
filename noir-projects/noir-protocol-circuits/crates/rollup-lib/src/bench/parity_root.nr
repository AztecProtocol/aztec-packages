use crate::bench::parity_public_inputs::BenchParityPublicInputs;
use types::proof::proof_data::UltraHonkProofData;

// Bench-only allowed VK indices. They do NOT correspond to any real vk-tree registration; they exist only to reproduce
// parity_root's per-child allowed-set membership check (a set of two candidates: chain base and empty filler) so the
// verifier gate cost is realistic. The concrete index values are irrelevant to the gate count.
global BENCH_PARITY_CHAIN_VK_INDEX: u32 = 21;
global BENCH_PARITY_EMPTY_VK_INDEX: u32 = 23;
global BENCH_ALLOWED_CHILD_VK_INDICES: [u32; 2] =
    [BENCH_PARITY_CHAIN_VK_INDEX, BENCH_PARITY_EMPTY_VK_INDEX];

pub type BenchParityChildProofData = UltraHonkProofData<BenchParityPublicInputs>;

/// Private inputs for the bench parity root, generic over the number of children `K`.
pub struct BenchParityRootPrivateInputs<let K: u32> {
    pub children: [BenchParityChildProofData; K],
}

/// Bench variant of the parity root circuit with the tree-merge machinery removed. It verifies `K` child proofs of the
/// bench parity shape, validating each child's vk against a two-element allowed set (chain base OR empty filler — the
/// empty-base filler of option 1b means children can carry different vks, so unlike production parity_root the check is
/// per-child rather than an "all equal" assertion). It then asserts rolling-hash and sponge continuity across children
/// and outputs the merged span. The 1/2/4 curve isolates the marginal cost of one in-circuit UltraHonk verification.
pub fn execute<let K: u32>(inputs: BenchParityRootPrivateInputs<K>) -> BenchParityPublicInputs {
    let vk_tree_root = inputs.children[0].public_inputs.vk_tree_root;
    let prover_id = inputs.children[0].public_inputs.prover_id;

    for i in 0..K {
        inputs.children[i].verify_proof();
        inputs.children[i].vk_data.validate_allowed_in_vk_tree(
            vk_tree_root,
            BENCH_ALLOWED_CHILD_VK_INDICES,
        );
    }

    let mut num_msgs = inputs.children[0].public_inputs.num_msgs;
    for i in 1..K {
        assert_eq(
            inputs.children[i].public_inputs.vk_tree_root,
            vk_tree_root,
            "Inconsistent vk tree roots across bench parity children",
        );
        assert_eq(
            inputs.children[i].public_inputs.prover_id,
            prover_id,
            "Inconsistent prover ids across bench parity children",
        );
        assert_eq(
            inputs.children[i].public_inputs.start_rolling_hash,
            inputs.children[i - 1].public_inputs.end_rolling_hash,
            "Inconsistent rolling hash across bench parity children",
        );
        assert_eq(
            inputs.children[i].public_inputs.start_sponge,
            inputs.children[i - 1].public_inputs.end_sponge,
            "Inconsistent message sponge across bench parity children",
        );
        num_msgs += inputs.children[i].public_inputs.num_msgs;
    }

    BenchParityPublicInputs {
        start_rolling_hash: inputs.children[0].public_inputs.start_rolling_hash,
        end_rolling_hash: inputs.children[K - 1].public_inputs.end_rolling_hash,
        start_sponge: inputs.children[0].public_inputs.start_sponge,
        end_sponge: inputs.children[K - 1].public_inputs.end_sponge,
        num_msgs,
        vk_tree_root,
        prover_id,
    }
}
