use crate::abis::{
    block_root_rollup_data::{BlockRootRollupBlobData, BlockRootRollupData},
    previous_rollup_data::PreviousRollupData,
};
use blob::blob_batching_public_inputs::{
    BatchingBlobCommitment, BlobAccumulatorPublicInputs, BLSPoint, FinalBlobBatchingChallenges,
};
use parity_lib::root::root_rollup_parity_input::RootRollupParityInput;
use std::test::OracleMock;
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_constant_data::BlockConstantData,
        block_header::BlockHeader, global_variables::GlobalVariables,
        partial_state_reference::PartialStateReference, sponge_blob::SpongeBlob,
    },
    address::EthAddress,
    constants::{
        ARCHIVE_HEIGHT, BLOBS_PER_BLOCK, FIELDS_PER_BLOB, L1_TO_L2_MSG_SUBTREE_HEIGHT,
        L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, L1_TO_L2_MSG_TREE_HEIGHT,
        PUBLIC_BASE_ROLLUP_VK_INDEX, ROOT_PARITY_INDEX,
    },
    merkle_tree::MerkleTree,
    proof::vk_data::VkData,
    tests::{fixtures, merkle_tree_utils::{compute_zero_hashes, NonEmptyMerkleTree}},
    traits::{Empty, Hash, Serialize},
};

pub struct RollupFixtureBuilder {
    pub previous_rollup_data: [PreviousRollupData; 2],
    pub previous_block_header: BlockHeader,
    pub previous_block_hash: Field,
    pub last_l1_to_l2: AppendOnlyTreeSnapshot,
    pub last_l1_to_l2_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],
    pub last_archive: AppendOnlyTreeSnapshot,
    pub last_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    pub new_archive: AppendOnlyTreeSnapshot,
    pub new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    pub start_blob_accumulator: BlobAccumulatorPublicInputs,
    pub final_blob_challenges: FinalBlobBatchingChallenges,
    pub blobs_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    pub blob_commitments: [BLSPoint; BLOBS_PER_BLOCK],
    pub blobs_hash: Field,
    pub vk_tree: MerkleTree<fixtures::vk_tree::VK_TREE_WIDTH>,
    pub vk_tree_root: Field,
    pub protocol_contract_tree_root: Field,
    pub global_variables: GlobalVariables,
    pub prover_id: Field,
}

impl RollupFixtureBuilder {
    pub fn new() -> Self {
        let vk_tree = fixtures::vk_tree::VK_MERKLE_TREE;
        let vk_tree_root = vk_tree.get_root();

        let mut global_variables = GlobalVariables::empty();
        global_variables.coinbase = EthAddress::from_field(998877);

        RollupFixtureBuilder {
            previous_rollup_data: [PreviousRollupData::empty(); 2],
            previous_block_header: BlockHeader::empty(),
            previous_block_hash: 0,
            last_l1_to_l2: AppendOnlyTreeSnapshot::empty(),
            last_l1_to_l2_subtree_sibling_path: [0; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],
            last_archive: AppendOnlyTreeSnapshot::empty(),
            last_archive_sibling_path: [0; ARCHIVE_HEIGHT],
            new_archive: AppendOnlyTreeSnapshot::empty(),
            new_archive_sibling_path: [0; ARCHIVE_HEIGHT],
            start_blob_accumulator: BlobAccumulatorPublicInputs::empty(),
            final_blob_challenges: FinalBlobBatchingChallenges::empty(),
            blobs_fields: [0; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
            blob_commitments: [BatchingBlobCommitment::empty().point; BLOBS_PER_BLOCK],
            blobs_hash: 0,
            vk_tree,
            vk_tree_root,
            protocol_contract_tree_root: 0,
            global_variables,
            prover_id: 0,
        }
    }

    pub fn new_for_block_root() -> Self {
        RollupFixtureBuilder::new()
            .with_l1_to_l2_roots()
            .with_previous_block_header()
            .with_last_archive()
            .with_previous_base_rollups()
    }

    pub fn with_previous_rollup_data(&mut self, vk_index: u32) -> Self {
        let mut rollup_0 = self.previous_rollup_data[0].base_or_merge_rollup_public_inputs;
        let mut rollup_1 = self.previous_rollup_data[1].base_or_merge_rollup_public_inputs;

        rollup_0.constants = self.to_block_constant_data();
        rollup_1.constants = self.to_block_constant_data();

        let vk = fixtures::vk_tree::generate_fake_rollup_honk_vk_for_index(vk_index);
        let vk_data = VkData {
            vk,
            leaf_index: vk_index,
            sibling_path: self.vk_tree.get_sibling_path(vk_index),
        };
        self.previous_rollup_data[0].vk_data = vk_data;
        self.previous_rollup_data[1].vk_data = vk_data;

        let mut note_hash_tree = self.previous_block_header.state.partial.note_hash_tree;
        rollup_0.start.note_hash_tree = note_hash_tree;
        note_hash_tree.root += 0x111;
        note_hash_tree.next_available_leaf_index += 1;
        rollup_0.end.note_hash_tree = note_hash_tree;
        rollup_1.start.note_hash_tree = note_hash_tree;
        note_hash_tree.root += 0x111;
        note_hash_tree.next_available_leaf_index += 1;
        rollup_1.end.note_hash_tree = note_hash_tree;

        let mut nullifier_tree = self.previous_block_header.state.partial.nullifier_tree;
        rollup_0.start.nullifier_tree = nullifier_tree;
        nullifier_tree.root += 0x222;
        nullifier_tree.next_available_leaf_index += 1;
        rollup_0.end.nullifier_tree = nullifier_tree;
        rollup_1.start.nullifier_tree = nullifier_tree;
        nullifier_tree.root += 0x222;
        nullifier_tree.next_available_leaf_index += 1;
        rollup_1.end.nullifier_tree = nullifier_tree;

        let mut public_data_tree = self.previous_block_header.state.partial.public_data_tree;
        rollup_0.start.public_data_tree = public_data_tree;
        public_data_tree.root += 0x333;
        public_data_tree.next_available_leaf_index += 1;
        rollup_0.end.public_data_tree = public_data_tree;
        rollup_1.start.public_data_tree = public_data_tree;
        public_data_tree.root += 0x333;
        public_data_tree.next_available_leaf_index += 1;
        rollup_1.end.public_data_tree = public_data_tree;

        rollup_0.num_txs = 1;
        rollup_1.num_txs = 1;

        rollup_0.accumulated_fees = 12;
        rollup_1.accumulated_fees = 34;

        rollup_0.out_hash = 1;
        rollup_1.out_hash = 2;

        self.previous_rollup_data[0].base_or_merge_rollup_public_inputs = rollup_0;
        self.previous_rollup_data[1].base_or_merge_rollup_public_inputs = rollup_1;

        *self
    }

    pub fn with_previous_base_rollups(&mut self) -> Self {
        self.with_previous_rollup_data(PUBLIC_BASE_ROLLUP_VK_INDEX)
    }

    pub fn with_blobs_fields<let N: u32, let M: u32>(
        &mut self,
        blob_fields_0: [Field; N],
        blob_fields_1: [Field; M],
    ) -> Self {
        for i in 0..N {
            self.blobs_fields[i] = blob_fields_0[i];
        }
        for i in 0..M {
            self.blobs_fields[N + i] = blob_fields_1[i];
        }

        self.blob_commitments[0] =
            BatchingBlobCommitment::from_limbs([31, 0, 0, 0], [75, 0, 0, 0]).point;

        self.blobs_hash = 8901;

        let mut sponge_blob = SpongeBlob::new(N + M);
        self.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_sponge_blob =
            sponge_blob;

        sponge_blob.absorb(blob_fields_0, N);
        self.previous_rollup_data[0].base_or_merge_rollup_public_inputs.end_sponge_blob =
            sponge_blob;
        self.previous_rollup_data[1].base_or_merge_rollup_public_inputs.start_sponge_blob =
            sponge_blob;

        sponge_blob.absorb(blob_fields_1, M);
        self.previous_rollup_data[1].base_or_merge_rollup_public_inputs.end_sponge_blob =
            sponge_blob;

        *self
    }

    pub fn with_l1_to_l2_roots(&mut self) -> Self {
        let zero_hashes = compute_zero_hashes([0; L1_TO_L2_MSG_TREE_HEIGHT]);
        let snapshot = AppendOnlyTreeSnapshot {
            root: zero_hashes[zero_hashes.len() - 1],
            next_available_leaf_index: 0,
        };

        let mut sibling_path = [0; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH];
        for i in 0..L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH {
            let index = L1_TO_L2_MSG_SUBTREE_HEIGHT + i - 1;
            sibling_path[i] = zero_hashes[index];
        }

        self.last_l1_to_l2 = snapshot;
        self.last_l1_to_l2_subtree_sibling_path = sibling_path;

        *self
    }

    pub fn with_previous_block_header(&mut self) -> Self {
        self.previous_block_header.state.l1_to_l2_message_tree = self.last_l1_to_l2;
        self.previous_block_header.state.partial = PartialStateReference {
            note_hash_tree: AppendOnlyTreeSnapshot { root: 0x101, next_available_leaf_index: 11 },
            nullifier_tree: AppendOnlyTreeSnapshot { root: 0x202, next_available_leaf_index: 22 },
            public_data_tree: AppendOnlyTreeSnapshot { root: 0x303, next_available_leaf_index: 33 },
        };

        self.previous_block_hash = self.previous_block_header.hash();

        *self
    }

    pub fn with_last_archive(&mut self) -> Self {
        let tree = NonEmptyMerkleTree::new(
            [self.previous_block_hash, 0],
            [0; ARCHIVE_HEIGHT],
            [0; ARCHIVE_HEIGHT - 1],
            [0; 1],
        );

        self.last_archive =
            AppendOnlyTreeSnapshot { root: tree.get_root(), next_available_leaf_index: 1 };

        self.last_archive_sibling_path = tree.get_sibling_path(0);
        self.new_archive_sibling_path = tree.get_sibling_path(1);

        *self
    }

    pub fn to_block_constant_data(self) -> BlockConstantData {
        BlockConstantData {
            last_archive: self.last_archive,
            last_l1_to_l2: self.last_l1_to_l2,
            vk_tree_root: self.vk_tree_root,
            protocol_contract_tree_root: self.protocol_contract_tree_root,
            global_variables: self.global_variables,
        }
    }

    pub fn to_root_rollup_parity_input(self) -> RootRollupParityInput {
        let mut input = RootRollupParityInput::empty();

        let vk_index = ROOT_PARITY_INDEX;
        input.verification_key = fixtures::vk_tree::generate_fake_honk_vk_for_index(vk_index);
        input.vk_path = self.vk_tree.get_sibling_path(vk_index);
        input.public_inputs.vk_tree_root = self.vk_tree_root;

        input
    }

    pub fn to_block_root_rollup_data(self) -> BlockRootRollupData {
        BlockRootRollupData {
            l1_to_l2_roots: self.to_root_rollup_parity_input(),
            l1_to_l2_message_subtree_sibling_path: self.last_l1_to_l2_subtree_sibling_path,
            previous_archive_sibling_path: self.last_archive_sibling_path,
            new_archive_sibling_path: self.new_archive_sibling_path,
            previous_block_header: self.previous_block_header,
            start_blob_accumulator: self.start_blob_accumulator,
            final_blob_challenges: self.final_blob_challenges,
            prover_id: self.prover_id,
        }
    }

    pub fn to_block_root_rollup_blob_data(self) -> BlockRootRollupBlobData {
        BlockRootRollupBlobData {
            blobs_fields: self.blobs_fields,
            blob_commitments: self.blob_commitments,
            blobs_hash: self.blobs_hash,
        }
    }

    pub fn mock_evaluate_blobs_and_batch(_self: Self) {
        // Safety: Mock the oracle call when the blob data is not relevant to the test.
        unsafe {
            let _ = OracleMock::mock("evaluateBlobs").returns(BlobAccumulatorPublicInputs::empty()
                .serialize());
        }
    }
}
