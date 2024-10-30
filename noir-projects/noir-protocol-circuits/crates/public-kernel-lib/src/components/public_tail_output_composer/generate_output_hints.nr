use crate::components::public_tail_output_composer::{
    generate_overridable_public_data_writes::{
        generate_overridable_public_data_writes, LinkedIndexHint,
    },
    generate_public_data_leaves::generate_public_data_leaves,
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs,
        public_data_write::OverridablePublicDataWrite,
    },
    constants::{
        MAX_ENCRYPTED_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        MAX_UNENCRYPTED_LOGS_PER_TX,
    },
    data::{OverridablePublicDataTreeLeaf, PublicDataLeafHint},
    hash::silo_note_hash,
    traits::Empty,
    utils::arrays::{
        array_merge, CombinedOrderHint, get_combined_order_hints_asc, sort_by_counter_asc,
        SortedResult,
    },
};

pub struct SiloedNoteHashHint {
    siloed_note_hash: Field,
    index: u32,
}

impl Empty for SiloedNoteHashHint {
    fn empty() -> Self {
        SiloedNoteHashHint { siloed_note_hash: 0, index: 0 }
    }
}

impl Eq for SiloedNoteHashHint {
    fn eq(self, other: Self) -> bool {
        (self.siloed_note_hash == other.siloed_note_hash) & (self.index == other.index)
    }
}

pub struct OutputHints<let NUM_PUBLIC_DATA_LEAVES: u32> {
    siloed_note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    siloed_note_hash_hints: [SiloedNoteHashHint; MAX_NOTE_HASHES_PER_TX],
    sorted_note_hash_hints: [CombinedOrderHint; MAX_NOTE_HASHES_PER_TX],
    sorted_nullifier_hints: [CombinedOrderHint; MAX_NULLIFIERS_PER_TX],
    sorted_l2_to_l1_msg_hints: [CombinedOrderHint; MAX_L2_TO_L1_MSGS_PER_TX],
    sorted_note_encrypted_log_hash_hints: [CombinedOrderHint; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    sorted_encrypted_log_hash_hints: [CombinedOrderHint; MAX_ENCRYPTED_LOGS_PER_TX],
    sorted_unencrypted_log_hash_hints: [CombinedOrderHint; MAX_UNENCRYPTED_LOGS_PER_TX],
    public_data_writes: [OverridablePublicDataWrite; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    public_data_leaves: [OverridablePublicDataTreeLeaf; NUM_PUBLIC_DATA_LEAVES],
    unique_slot_index_hints: SortedResult<Field, NUM_PUBLIC_DATA_LEAVES>,
    public_data_linked_index_hints: [LinkedIndexHint; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
}

pub unconstrained fn generate_output_hints<let NUM_PUBLIC_DATA_LEAVES: u32>(
    previous_kernel: PublicKernelCircuitPublicInputs,
    public_data_leaf_hints: [PublicDataLeafHint; NUM_PUBLIC_DATA_LEAVES],
) -> OutputHints<NUM_PUBLIC_DATA_LEAVES> {
    let non_revertible = previous_kernel.end_non_revertible;
    let revertible = previous_kernel.end;

    // Note hashes.
    let mut siloed_note_hashes = [0; MAX_NOTE_HASHES_PER_TX];
    let mut siloed_note_hash_hints = [SiloedNoteHashHint::empty(); MAX_NOTE_HASHES_PER_TX];
    let sorted_unsiloed_note_hashes = sort_by_counter_asc(array_merge(
        non_revertible.note_hashes,
        revertible.note_hashes,
    ));
    let tx_hash = non_revertible.nullifiers[0].value;
    for i in 0..sorted_unsiloed_note_hashes.len() {
        let note_hash = sorted_unsiloed_note_hashes[i];
        let siloed_note_hash = if note_hash.counter() == 0 {
            // If counter is zero, the note hash is either empty or is emitted from private and has been siloed in private_kernel_tail_to_public.
            note_hash.value()
        } else {
            silo_note_hash(note_hash, tx_hash, i)
        };
        siloed_note_hashes[i] = siloed_note_hash;
        if siloed_note_hash != 0 {
            siloed_note_hash_hints[i] = SiloedNoteHashHint { siloed_note_hash, index: i };
        }
    }

    // Public data.
    let combined_writes = array_merge(
        previous_kernel.end_non_revertible.public_data_update_requests,
        previous_kernel.end.public_data_update_requests,
    );
    let (public_data_leaves, unique_slot_index_hints) = generate_public_data_leaves(
        previous_kernel.validation_requests.public_data_reads,
        combined_writes,
        public_data_leaf_hints,
    );
    let (public_data_writes, public_data_linked_index_hints) =
        generate_overridable_public_data_writes(combined_writes, public_data_leaves);

    OutputHints {
        siloed_note_hashes,
        siloed_note_hash_hints,
        sorted_note_hash_hints: get_combined_order_hints_asc(
            non_revertible.note_hashes,
            revertible.note_hashes,
        ),
        sorted_nullifier_hints: get_combined_order_hints_asc(
            non_revertible.nullifiers,
            revertible.nullifiers,
        ),
        sorted_l2_to_l1_msg_hints: get_combined_order_hints_asc(
            non_revertible.l2_to_l1_msgs,
            revertible.l2_to_l1_msgs,
        ),
        sorted_note_encrypted_log_hash_hints: get_combined_order_hints_asc(
            non_revertible.note_encrypted_logs_hashes,
            revertible.note_encrypted_logs_hashes,
        ),
        sorted_encrypted_log_hash_hints: get_combined_order_hints_asc(
            non_revertible.encrypted_logs_hashes,
            revertible.encrypted_logs_hashes,
        ),
        sorted_unencrypted_log_hash_hints: get_combined_order_hints_asc(
            non_revertible.unencrypted_logs_hashes,
            revertible.unencrypted_logs_hashes,
        ),
        public_data_writes,
        public_data_leaves,
        unique_slot_index_hints,
        public_data_linked_index_hints,
    }
}
