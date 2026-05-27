mod previous_kernel_tests;
mod read_request_tests;
mod key_validation_tests;
mod transient_data_tests;
mod siloing_tests;
mod padding_tests;
mod propagated_value_tests;
mod reset_output_validator;

use crate::{
    abis::{PaddedSideEffects, PrivateKernelResetHints},
    components::reset_output_composer::{
        silo_note_hash, silo_nullifier, silo_private_log, uniquify_siloed_note_hash,
    },
    private_kernel_reset::PrivateKernelResetCircuitPrivateInputs,
    reset::{KeyValidationHint, ReadRequestHintsBuilder, TransientDataSquashingHint},
};
use protocol_test_utils::{FixtureBuilder, pad_end, pad_end_with};
use std::embedded_curve_ops::{EmbeddedCurveScalar, fixed_base_scalar_mul as derive_public_key};
use types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, note_hash::NoteHash,
        note_hash_leaf_preimage::NoteHashLeafPreimage, nullifier::Nullifier,
        nullifier_leaf_preimage::NullifierLeafPreimage,
        private_kernel_data::PrivateKernelDataWithoutPublicInputs, private_log::PrivateLogData,
    },
    constants::{
        MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIERS_PER_TX, NOTE_HASH_SUBTREE_HEIGHT,
        NOTE_HASH_TREE_HEIGHT, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_TREE_HEIGHT,
        PRIVATE_KERNEL_INNER_VK_INDEX,
    },
    hash::{compute_app_siloed_secret_key, compute_siloed_nullifier},
    merkle_tree::{
        LeafPreimage, MembershipWitness, nullifier_merkle_hash, test_utils::SingleSubtreeMerkleTree,
    },
    point::EmbeddedCurvePoint,
    public_keys::hash_public_key,
    side_effect::{Counted, Scoped},
    traits::Empty,
    utils::arrays::find_first_index,
};

global NOTE_HASH_PENDING_READ_HINTS_LEN: u32 = 8;
global NOTE_HASH_SETTLED_READ_HINTS_LEN: u32 = 5;
global NULLIFIER_PENDING_READ_HINTS_LEN: u32 = 6;
global NULLIFIER_SETTLED_READ_HINTS_LEN: u32 = 4;
global KEY_VALIDATION_HINTS_LEN: u32 = 3;
global TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32 = 7;

global NOTE_HASH_SILOING_AMOUNT: u32 = 6;
global NULLIFIER_SILOING_AMOUNT: u32 = 5;
global PRIVATE_LOG_SILOING_AMOUNT: u32 = 4;

struct TestBuilder {
    pub previous_kernel: FixtureBuilder,
    pub padded_side_effects: PaddedSideEffects,
    pub transient_data_squashing_hints: [TransientDataSquashingHint; TRANSIENT_DATA_SQUASHING_HINTS_LEN],
    pub note_hash_read_request_hints: ReadRequestHintsBuilder<MAX_NOTE_HASH_READ_REQUESTS_PER_TX, NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN, NOTE_HASH_TREE_HEIGHT, NoteHashLeafPreimage>,
    pub nullifier_read_request_hints: ReadRequestHintsBuilder<MAX_NULLIFIER_READ_REQUESTS_PER_TX, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN, NULLIFIER_TREE_HEIGHT, NullifierLeafPreimage>,
    pub key_validation_hints: BoundedVec<KeyValidationHint, KEY_VALIDATION_HINTS_LEN>,
    // `output` is used in tests for ResetOutputValidator.
    pub output: FixtureBuilder,
    note_hash_preimages: [NoteHashLeafPreimage; MAX_NOTE_HASHES_PER_TX],
    note_hash_tree: SingleSubtreeMerkleTree<MAX_NOTE_HASHES_PER_TX, NOTE_HASH_SUBTREE_HEIGHT, NOTE_HASH_TREE_HEIGHT>,
    pre_existing_nullifier_values: [Field; MAX_NULLIFIERS_PER_TX],
    nullifier_preimages: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
    nullifier_tree: SingleSubtreeMerkleTree<MAX_NULLIFIERS_PER_TX, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_TREE_HEIGHT>,
}

impl TestBuilder {
    pub fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new().in_vk_tree(PRIVATE_KERNEL_INNER_VK_INDEX);

        let note_hash_preimages = pad_end([
            NoteHashLeafPreimage { value: 111 },
            NoteHashLeafPreimage { value: 222 },
            NoteHashLeafPreimage { value: 333 },
            NoteHashLeafPreimage { value: 444 },
        ]);
        let note_hash_tree = SingleSubtreeMerkleTree::new(note_hash_preimages.map(|n| n.as_leaf()));
        previous_kernel.anchor_block_header.state.partial.note_hash_tree.root =
            note_hash_tree.get_root();
        previous_kernel.anchor_block_header.state.partial.note_hash_tree.next_available_leaf_index =
            note_hash_tree.get_next_available_index();

        let contract_address = previous_kernel.contract_address;
        let pre_existing_nullifier_values = [11, 22, 33];
        let siloed_nullifier_values =
            pre_existing_nullifier_values.map(|n| compute_siloed_nullifier(contract_address, n));
        // The value of `next_nullifier` doesn't matter for this circuit.
        let nullifier_preimages = pad_end([
            NullifierLeafPreimage {
                nullifier: siloed_nullifier_values[0],
                next_nullifier: siloed_nullifier_values[1],
                next_index: 1,
            },
            NullifierLeafPreimage {
                nullifier: siloed_nullifier_values[1],
                next_nullifier: siloed_nullifier_values[2],
                next_index: 2,
            },
            NullifierLeafPreimage {
                nullifier: siloed_nullifier_values[2],
                next_nullifier: 0,
                next_index: 0,
            },
        ]);
        let nullifier_tree = SingleSubtreeMerkleTree::new_with_hasher(
            nullifier_preimages.map(|n| n.as_leaf()),
            nullifier_merkle_hash,
        );
        previous_kernel.anchor_block_header.state.partial.nullifier_tree.root =
            nullifier_tree.get_root();
        previous_kernel.anchor_block_header.state.partial.nullifier_tree.next_available_leaf_index =
            nullifier_tree.get_next_available_index();

        let output = previous_kernel;

        Self {
            previous_kernel,
            padded_side_effects: PaddedSideEffects::empty(),
            transient_data_squashing_hints: pad_end_with(
                [],
                TransientDataSquashingHint::skip(MAX_NULLIFIERS_PER_TX, MAX_NOTE_HASHES_PER_TX),
            ),
            note_hash_read_request_hints: ReadRequestHintsBuilder::new(),
            nullifier_read_request_hints: ReadRequestHintsBuilder::new(),
            key_validation_hints: BoundedVec::new(),
            output,
            note_hash_preimages,
            note_hash_tree,
            pre_existing_nullifier_values: pad_end(pre_existing_nullifier_values),
            nullifier_preimages,
            nullifier_tree,
        }
    }

    pub fn read_pending_note_hash(&mut self, note_hash_index: u32) {
        let read_request_index =
            self.previous_kernel.add_read_request_for_pending_note_hash(note_hash_index);
        self.note_hash_read_request_hints.add_pending_read_hint(read_request_index, note_hash_index);
    }

    pub fn read_settled_note_hash(&mut self, preimage_index: u32) {
        let preimage = self.note_hash_preimages[preimage_index];
        let read_request_index =
            self.previous_kernel.add_settled_note_hash_read_request(preimage.value);
        let leaf_index = preimage_index as Field;
        let membership_witness = MembershipWitness {
            leaf_index,
            sibling_path: self.note_hash_tree.get_sibling_path(leaf_index),
        };
        self.note_hash_read_request_hints.add_settled_read_hint(
            read_request_index,
            membership_witness,
            preimage,
        );
    }

    pub fn read_pending_nullifier(&mut self, nullifier_index: u32) {
        let read_request_index =
            self.previous_kernel.add_read_request_for_pending_nullifier(nullifier_index);
        self.nullifier_read_request_hints.add_pending_read_hint(read_request_index, nullifier_index);
    }

    pub fn read_settled_nullifier(&mut self, preimage_index: u32) {
        let preimage = self.nullifier_preimages[preimage_index];
        let read_request_index =
            self.previous_kernel.add_read_request_for_settled_nullifier(preimage.nullifier);
        let leaf_index = preimage_index as Field;
        let membership_witness = MembershipWitness {
            leaf_index,
            sibling_path: self.nullifier_tree.get_sibling_path(leaf_index),
        };
        self.nullifier_read_request_hints.add_settled_read_hint(
            read_request_index,
            membership_witness,
            preimage,
        );
    }

    pub fn nullify_pending_note_hash(&mut self, nullifier_index: u32, note_hash_index: u32) {
        let note_hash = self.previous_kernel.note_hashes.get(note_hash_index).innermost();
        let mut nullifier = self.previous_kernel.nullifiers.get(nullifier_index);
        nullifier.inner.inner.note_hash = note_hash;
        self.previous_kernel.nullifiers.set(nullifier_index, nullifier);
        // Safety: this is only used in tests.
        let num_hints = unsafe {
            find_first_index(
                self.transient_data_squashing_hints,
                |hint: TransientDataSquashingHint| {
                    hint.nullifier_index == MAX_NULLIFIERS_PER_TX
                },
            )
        };
        self.transient_data_squashing_hints[num_hints] =
            TransientDataSquashingHint { nullifier_index, note_hash_index };
    }

    pub fn add_key_validation_request(&mut self, sk: Field) {
        let sk_m = EmbeddedCurveScalar::from_field(sk);
        let pk_m = derive_public_key(sk_m);
        let pk_m_hash = hash_public_key(pk_m);

        let key_type_domain_separator = 123321;
        let contract_address = self.previous_kernel.contract_address;
        let sk_app =
            compute_app_siloed_secret_key(sk_m, contract_address, key_type_domain_separator);

        self.previous_kernel.add_request_for_key_validation(
            pk_m_hash,
            sk_app,
            key_type_domain_separator,
        );
    }

    pub fn add_key_validation_request_and_hint(&mut self, sk: Field) {
        self.add_key_validation_request(sk);

        let sk_m = EmbeddedCurveScalar::from_field(sk);
        self.key_validation_hints.push(KeyValidationHint { sk_m });
    }

    pub fn compute_output_note_hashes<let N: u32>(
        self,
        note_hashes: [Scoped<Counted<NoteHash>>; N],
    ) -> [Scoped<Counted<NoteHash>>; N] {
        let is_private_only = self.previous_kernel.is_private_only;
        let claimed_revertible_counter = self.previous_kernel.claimed_revertible_counter;

        let mut output = note_hashes;
        for i in 0..N {
            let note_hash = note_hashes[i];
            // We don't silo revertible note hashes with nonces, since we don't know their final position in the tx
            output[i] = if note_hash.is_non_revertible(is_private_only, claimed_revertible_counter) {
                self.compute_output_unique_siloed_note_hash(note_hash, i)
            } else {
                self.compute_output_siloed_note_hash(note_hash)
            };
        }
        output
    }

    pub fn compute_output_siloed_note_hash(
        _self: Self,
        note_hash: Scoped<Counted<NoteHash>>,
    ) -> Scoped<Counted<NoteHash>> {
        silo_note_hash(note_hash)
    }

    pub fn compute_output_unique_siloed_note_hash(
        self,
        note_hash: Scoped<Counted<NoteHash>>,
        note_hash_index: u32,
    ) -> Scoped<Counted<NoteHash>> {
        let siloed_note_hash = self.compute_output_siloed_note_hash(note_hash);
        uniquify_siloed_note_hash(
            siloed_note_hash,
            self.previous_kernel.claimed_first_nullifier,
            note_hash_index,
        )
    }

    pub fn compute_output_nullifiers<let N: u32>(
        _self: Self,
        nullifiers: [Scoped<Counted<Nullifier>>; N],
    ) -> [Scoped<Counted<Nullifier>>; N] {
        nullifiers.map(|n| silo_nullifier(n))
    }

    pub fn compute_output_private_logs<let N: u32>(
        _self: Self,
        private_logs: [Scoped<Counted<PrivateLogData>>; N],
    ) -> [Scoped<Counted<PrivateLogData>>; N] {
        private_logs.map(|n| silo_private_log(n))
    }

    /// No siloing. Routes through `execute` (inner reset).
    pub fn execute(self) -> PrivateKernelCircuitPublicInputs {
        let inputs = self.to_private_inputs();
        inputs
            .execute::<NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN, 0, 0, 0>()
    }

    /// With siloing. Routes through `execute_as_terminal` (the terminal reset+tail path), since
    /// `execute` asserts the siloing amounts are zero.
    pub fn execute_with_siloing(self) -> PrivateKernelCircuitPublicInputs {
        let inputs = self.to_private_inputs();
        inputs
            .execute_as_terminal::<NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN, NOTE_HASH_SILOING_AMOUNT, NULLIFIER_SILOING_AMOUNT, PRIVATE_LOG_SILOING_AMOUNT>()
    }

    fn to_private_inputs(
        self,
    ) -> PrivateKernelResetCircuitPrivateInputs<NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN, NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN> {
        let hints = PrivateKernelResetHints {
            note_hash_read_request_hints: self.note_hash_read_request_hints.to_hints(),
            nullifier_read_request_hints: self.nullifier_read_request_hints.to_hints(),
            key_validation_hints: self.key_validation_hints.storage(),
            transient_data_squashing_hints: self.transient_data_squashing_hints,
        };

        let previous_kernel = self.previous_kernel.to_private_kernel_data();

        PrivateKernelResetCircuitPrivateInputs::new(
            PrivateKernelDataWithoutPublicInputs { vk_data: previous_kernel.vk_data },
            previous_kernel.public_inputs,
            self.padded_side_effects,
            hints,
        )
    }

    pub fn failed(self) {
        let _ = self.execute();
    }

    pub fn succeeded(self) {
        let _ = self.execute();
    }
}
