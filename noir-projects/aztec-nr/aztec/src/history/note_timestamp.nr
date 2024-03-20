use dep::std::merkle::compute_merkle_root;
use dep::protocol_types::header::Header;

use crate::{
    context::PrivateContext,
    note::{utils::compute_note_hash_for_consumption, note_interface::NoteInterface},
    oracle::get_membership_witness::get_note_hash_membership_witness,
    history::{
    note_inclusion::prove_note_inclusion, note_inclusion::_note_inclusion,
    nullifier_non_inclusion::prove_note_not_nullified, nullifier_non_inclusion::_nullifier_non_inclusion
}
};
use crate::{context::PrivateContext, note::note_interface::NoteInterface};

pub fn get_note_timestamp<Note, N>(
    note: Note,
    context: &mut PrivateContext
) -> Option<u32>
where Note: NoteInterface<N> {
    let first_block = 1;
    let latest_header = context.get_header();
    let last_block = latest_header.global_variables.block_number;
    let first_block_included = None;

    
    for i in 0..last_block {
        if first_block > last_block {
            break; 
        }
        let mid = first_block + (last_block - first_block) / 2;
        let temp_context = context.clone();

        let does_note_exist = prove_note_inclusion_at(note.clone(), mid, temp_context);

        if does_note_exist == true {
            if mid == first_block | !prove_note_inclusion_at(note.clone(), mid - 1, temp_context) {
                first_block_included = Some(mid); 
                break;
            } else {
                last_block = mid - 1; 
            }
        } else {
            first_block = mid + 1;
        }
    }

    first_block_included;
}
