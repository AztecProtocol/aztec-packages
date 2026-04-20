use crate::asserted_note::AssertedNote;
use aztec::{
    note::{ConfirmedNote, note_metadata::NoteMetadata},
    oracle::offchain_effect::emit_offchain_effect,
    protocol::{address::AztecAddress, traits::{Deserialize, Serialize}},
};

global NULLIFICATION_EFFECT_TYPE: u8 = 1;
global INSERTION_EFFECT_TYPE: u8 = 2;

#[derive(Serialize, Deserialize)]
struct NullificationEffect {
    typ: u8,
    amount: u128,
    owner: AztecAddress,
    randomness: Field,
    storage_slot: Field,
    proven_note_hash: Field,
    metadata: NoteMetadata,
}

impl NullificationEffect {
    fn new(note: ConfirmedNote<AssertedNote>) -> Self {
        Self {
            typ: NULLIFICATION_EFFECT_TYPE,
            amount: note.note.amount,
            owner: note.owner,
            randomness: note.randomness,
            storage_slot: note.storage_slot,
            proven_note_hash: note.proven_note_hash,
            metadata: note.metadata,
        }
    }
}

pub unconstrained fn emit_nullification_effect(note: ConfirmedNote<AssertedNote>) {
    emit_offchain_effect(NullificationEffect::new(note));
}

#[derive(Serialize, Deserialize)]
struct InsertionEffect {
    typ: u8,
    amount: u128,
    owner: AztecAddress,
    randomness: Field,
    storage_slot: Field,
}

impl InsertionEffect {
    fn new(amount: u128, owner: AztecAddress, randomness: Field, storage_slot: Field) -> Self {
        Self { typ: INSERTION_EFFECT_TYPE, amount, owner, randomness, storage_slot }
    }
}

pub unconstrained fn emit_insertion_effect(
    amount: u128,
    owner: AztecAddress,
    randomness: Field,
    storage_slot: Field,
) {
    emit_offchain_effect(
        InsertionEffect::new(amount, owner, randomness, storage_slot),
    );
}
