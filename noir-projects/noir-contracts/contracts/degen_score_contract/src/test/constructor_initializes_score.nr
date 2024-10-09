use dep::aztec::test::{helpers::{cheatcodes, test_environment::TestEnvironment}};
use dep::aztec::protocol_types::storage::map::derive_storage_slot_in_map;
use dep::aztec::note::note_getter::{MAX_NOTES_PER_PAGE, view_notes};
use dep::aztec::note::note_viewer_options::NoteViewerOptions;
use crate::DegenScore;
use crate::types::DegenScoreNote::DegenScoreNote;

#[test]
unconstrained fn constructor_initializes_score() {
    let mut env = TestEnvironment::new();
    let owner = env.create_account();
    env.impersonate(owner);

    let initializer = DegenScore::interface().constructor(owner);
    
    // Debug: Check if initializer is created successfully
    println("Initializer created");

    let degen_score_contract = env.deploy_self("DegenScore").with_private_initializer(initializer);
    
    // Debug: Check if contract is deployed successfully
    println("Contract deployed");

    let contract_address = degen_score_contract.to_address();

    // Debug: Print contract address
    let fmt_str = f"Contract address: {contract_address}";
    println(fmt_str);

    env.impersonate(contract_address);
    let unconstrained_context = env.unkonstrained();
    let storage = DegenScore::Storage::init(unconstrained_context);
    
    let degen_scores_slot = DegenScore::storage_layout().degen_scores.slot;
    let owner_slot = derive_storage_slot_in_map(degen_scores_slot, owner);
    
    let mut options = NoteViewerOptions::new();
    let notes: BoundedVec<DegenScoreNote, MAX_NOTES_PER_PAGE> = view_notes(owner_slot, options);
    
    // // Debug: Print number of notes found
    // println("Number of notes: {}", notes.len());

    assert(notes.len() > 0, "No notes found");
    let initial_note = notes.get(0);
    
    // // Debug: Print initial note details
    // println("Initial note score: {}", initial_note.score);
    // println("Initial note owner: {}", initial_note.owner);

    assert(initial_note.score == 0, f"Expected initial score 0 but got {initial_note.score}");
    assert(initial_note.owner == owner, "Owner mismatch in the initial note");
}