use aztec::{
    note::note_interface::NoteHash,
    protocol::{address::AztecAddress, hash::{compute_siloed_note_hash, compute_unique_note_hash}, traits::FromField},
};
use uint_note::UintNote;

// docs:start:circuit
/// Proves knowledge of the randomness, storage slot and nonce that make a `UintNote` of `value`, owned by `owner` in
/// `contract_address`, hash to `settled_note_hash`. It does not prove that the hash is in the note hash tree, nor
/// that the note is unspent: the verifier checks those against the chain.
fn main(
    settled_note_hash: pub Field,
    contract_address: pub Field,
    owner: pub Field,
    value: pub u128,
    randomness: Field,
    storage_slot: Field,
    note_nonce: Field,
) {
    let note_hash = UintNote { value }.compute_note_hash(AztecAddress::from_field(owner), storage_slot, randomness);
    let siloed_note_hash = compute_siloed_note_hash(AztecAddress::from_field(contract_address), note_hash);
    assert_eq(compute_unique_note_hash(note_nonce, siloed_note_hash), settled_note_hash);
}
// docs:end:circuit
