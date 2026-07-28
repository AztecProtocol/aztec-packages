use crate::{
    abis::{BlockRollupPublicInputs, L1ToL2MessageSponge},
    block_merge::validate_consecutive_block_rollups,
};
use types::{
    abis::block_header::BlockHeader,
    blob_data::SpongeBlob,
    constants::ARCHIVE_HEIGHT,
    merkle_tree::{check_membership, MembershipWitness},
    proof::proof_data::RollupHonkProofData,
    traits::{Empty, Hash},
};

pub struct CheckpointRootInputsValidator<let NumPreviousRollups: u32, let NumVkIndices: u32> {
    previous_rollups: [RollupHonkProofData<BlockRollupPublicInputs>; NumPreviousRollups],
    allowed_previous_vk_indices: [u32; NumVkIndices],
    previous_block_header: BlockHeader,
    previous_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl<let NumPreviousRollups: u32, let NumVkIndices: u32> CheckpointRootInputsValidator<NumPreviousRollups, NumVkIndices> {
    pub fn new(
        previous_rollups: [RollupHonkProofData<BlockRollupPublicInputs>; NumPreviousRollups],
        allowed_previous_vk_indices: [u32; NumVkIndices],
        previous_block_header: BlockHeader,
        previous_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    ) -> Self {
        CheckpointRootInputsValidator {
            previous_rollups,
            allowed_previous_vk_indices,
            previous_block_header,
            previous_archive_sibling_path,
        }
    }

    pub fn validate(self) {
        self.validate_previous_rollup_proofs_and_vks();

        for i in 1..NumPreviousRollups {
            validate_consecutive_block_rollups(
                self.previous_rollups[i - 1].public_inputs,
                self.previous_rollups[i].public_inputs,
            );
        }

        self.validate_start_states();
    }

    fn validate_previous_rollup_proofs_and_vks(self) {
        if !::std::runtime::is_unconstrained() {
            for i in 0..NumPreviousRollups {
                self.previous_rollups[i].verify_proof();
            }
        }

        let vk_tree_root = self.previous_rollups[0].public_inputs.constants.vk_tree_root;
        for i in 0..NumPreviousRollups {
            self.previous_rollups[i].vk_data.validate_allowed_in_vk_tree(
                vk_tree_root,
                self.allowed_previous_vk_indices,
            );
        }
    }

    fn validate_start_states(self) {
        let first_rollup = self.previous_rollups[0].public_inputs;

        // The following check prevents injecting unexpected tx effects via the first tx_base of a checkpoint.
        let expected_start_sponge_blob = SpongeBlob::init();
        assert_eq(
            first_rollup.start_sponge_blob,
            expected_start_sponge_blob,
            "The start blob sponge was not correctly initialized",
        );

        // Note: we validate the correctness of the previous block header at the end of this function.

        assert_eq(
            first_rollup.start_state,
            self.previous_block_header.state,
            "The start state of the checkpoint does not match the state in the previous block header",
        );

        // Notice: unlike blocks within the same checkpoint (which share the same timestamp),
        // the blocks of _different_ checkpoints must have strictly increasing timestamps.
        // I.e. the `>` here is _intentional_.
        assert(
            first_rollup.timestamp > self.previous_block_header.global_variables.timestamp,
            "The start timestamp must be after the previous block's timestamp",
        );

        // The leftmost block of the checkpoint must be a first block root, which is the only variant that sets
        // `is_first_block`. `validate_consecutive_block_rollups` asserts every non-first ("right") rollup is not a
        // first block, so the merged value can only be true if the leftmost leaf is a first block root.
        assert(
            first_rollup.is_first_block,
            "The first block of the checkpoint must be a first block root",
        );

        // The message sponge resets per checkpoint, so the leftmost block must start from the empty sponge. Combined
        // with the checkpoint root asserting the merged end equals the parity root's sponge, this anchors the sponge
        // chain to exactly this checkpoint's messages.
        assert_eq(
            first_rollup.start_msg_sponge,
            L1ToL2MessageSponge::empty(),
            "The message sponge of the first block was not correctly initialized",
        );

        // `previous_block_header` is provided as a private input and is used to validate the values above.
        // Here we make sure it's indeed the header of the previous block by checking it against the previous archive.
        // The correctness of the claimed previous archive will be validated when this epoch's proof is submitted to L1.
        self.validate_previous_block_header_in_archive();
    }

    /// Check that the hash of the previous block header is the last leaf in the previous archive.
    fn validate_previous_block_header_in_archive(self) {
        let previous_archive = self.previous_rollups[0].public_inputs.previous_archive;
        let last_leaf_index = previous_archive.next_available_leaf_index - 1;
        let previous_block_hash = self.previous_block_header.hash();

        assert(
            check_membership(
                previous_block_hash,
                MembershipWitness {
                    leaf_index: last_leaf_index as Field,
                    sibling_path: self.previous_archive_sibling_path,
                },
                previous_archive.root,
            ),
            "Hash of the previous block header is not the last leaf in the archive tree",
        );
    }
}
