use dep::std::merkle::compute_merkle_root;
use dep::protocol_types::header::Header;

use crate::{
    context::PrivateContext,
    note::{utils::compute_note_hash_for_consumption, note_interface::NoteInterface},
    oracle::get_membership_witness::get_note_hash_membership_witness,
    history::{note_inclusion:: {prove_note_inclusion, prove_note_inclusion_at}}
};

fn is_note_in_this_block<Note, N>(
    note: Note, 
    header: Header
 ) -> bool where Note: NoteInterface<N> {


    let note_hash = compute_note_hash_for_consumption(note);
    let witness = get_note_hash_membership_witness(header.global_variables.block_number as u32, note_hash);

    header.state.partial.note_hash_tree.root == compute_merkle_root(note_hash, witness.index, witness.path)
}


pub fn get_note_inclusion_timestamp<Note, N>(
    note: Note,
    context: PrivateContext,
    block_number: u32,
) -> Field  where Note: NoteInterface<N> {

    let max_iterations: u32 = 24; // log2(10,000,000) 
    let mut first_block_number = 1;
    let mut first_block_included = 0;
    // let latest_header = context.get_header();
    // let mut last_block_number = latest_header.global_variables.block_number as u32;
    let mut found = false;

    let mut last_block_number = block_number;

    for i in 0..max_iterations {
  
        if first_block_number > last_block_number {
            first_block_included = 0; 
        }
       
        let mid_block_number = first_block_number + (last_block_number - first_block_number) / 2;
    
        let mut header = context.get_header_at(mid_block_number);
      
        if is_note_in_this_block(note, header) == true {
              header = context.get_header_at(mid_block_number-1);
              if (mid_block_number == first_block_number) | (is_note_in_this_block(note, header) == false) {
                first_block_included = mid_block_number; 
                
                 found = true;
            } else {
                last_block_number = mid_block_number - 1; 
            }
        } else {
            first_block_number = mid_block_number + 1;
        }
          if !found {
            first_block_included = 0; 
          
    }
    }
    if first_block_number !=0 {
        let first_block_number_header = context.get_header_at(first_block_number);
      
        first_block_number_header.global_variables.timestamp
    } else {
        0x0
    }
    
   
}
