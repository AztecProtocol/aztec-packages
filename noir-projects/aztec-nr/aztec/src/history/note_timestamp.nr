use dep::std::merkle::compute_merkle_root;
use dep::protocol_types::header::Header;

use crate::{
    context::PrivateContext,
    note::{utils::compute_note_hash_for_consumption, note_interface::NoteInterface},
    oracle::get_membership_witness::get_note_hash_membership_witness,
    history::{
    note_inclusion::prove_note_inclusion, note_inclusion::_note_inclusion,
    nullifier_non_inclusion::prove_note_not_nullified, nullifier_non_inclusion::_nullifier_non_inclusion
},
};
use crate::{
    context::PrivateContext,
    note::note_interface::NoteInterface,
};

pub fn get_note_timestamp<Note, N>(note: Note, context: &PrivateContext) -> Option<u32>
where Note: NoteInterface<N> {
    let first_block = u32;
    let latest_header = context.get_header(); // Ensure this method correctly retrieves the latest block's header
    let last_block = latest_header.global_variables.block_number;
n
    for i in 0..=last_block {
        if first_block > last_block {
            break;
        }
        let mid = first_block + (last_block - first_block) / 2;
        let temp_context = context; // Assuming cloning is necessary for your context

        if prove_note_inclusion_at(note, mid, &temp_context) {
            if mid == first_block || !prove_note_inclusion_at(note, mid - 1, &temp_context) {
                return Some(mid); // Found the earliest block where the note is included
            } else {
                last_block = mid - 1; // Adjust the end of the range for the next iteration
            }
        } else {
            first_block = mid + 1; // Adjust the start of the range for the next iteration
        }
    }

    None // If the note is not found in any block
}