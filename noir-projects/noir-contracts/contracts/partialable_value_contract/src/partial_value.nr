use dep::aztec::{
    protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}},
    note::{note_header::NoteHeader, note_interface::NoteInterface, utils::compute_note_hash_for_consumption},
    oracle::{unsafe_rand::unsafe_rand, nullifier_key::get_nullifier_secret_key, get_public_key::get_public_key},
    log::emit_encrypted_log, hash::pedersen_hash, context::PrivateContext
};
use dep::std::hash::{pedersen_commitment, pedersen_commitment_with_separator};

global PARTIALABLE_VALUE_NOTE_LEN: Field = 3; // 3 plus a header.

// docs:start:value-note-def
#[aztec(note)]
struct PartialableValueNote {
    value: Field,
    owner: AztecAddress,
    randomness: Field,
}
// docs:end:value-note-def

impl NoteInterface<PARTIALABLE_VALUE_NOTE_LEN> for PartialableValueNote {
    // docs:start:nullifier

    fn compute_nullifier(self, context: &mut PrivateContext) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = context.request_nullifier_secret_key(self.owner);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            note_hash_for_nullify,
            secret.low,
            secret.high,
        ],0)
    }

    // docs:end:nullifier

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = get_nullifier_secret_key(self.owner);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            note_hash_for_nullify,
            secret.low,
            secret.high,
        ],0)
    }

    // Broadcasts the note as an encrypted log on L1.
    fn broadcast(self, context: &mut PrivateContext, slot: Field) {
        let encryption_pub_key = get_public_key(self.owner);
        emit_encrypted_log(
            context,
            (*context).this_address(),
            slot,
            Self::get_note_type_id(),
            encryption_pub_key,
            self.serialize_content(),
        );
    }
}

impl PartialableValueNote {
    pub fn new(value: Field, owner: AztecAddress) -> Self {
        let randomness = unsafe_rand();
        let header = NoteHeader::empty();
        PartialableValueNote { value, owner, randomness, header }
    }
}

impl Serialize<7> for PartialableValueNote {
    fn serialize(self) -> [Field; 7] {
        let header = self.header.serialize();

        [self.value, self.owner.to_field(), self.randomness, header[0], header[1], header[2], header[3]]
    }
}

// 

#[test]
fn test_simple_pedersen_homomorphism() {
    let a = pedersen_commitment([1]);
    let b = pedersen_commitment([1]);
    let result = a + b;

    let expected = pedersen_commitment([2]);
    assert(result == expected);
}

#[test]
fn test_simple_pedersen_homomorphism_non_zero_separator() {
    let a = pedersen_commitment_with_separator([1], 42);
    let b = pedersen_commitment_with_separator([1], 42);
    let result = a + b;

    let expected = pedersen_commitment_with_separator([2], 42);
    assert(result == expected);
}

#[test]
fn test_pedersen_homomorphism_with_domain_sep() {
    let a = pedersen_commitment_with_separator([1], 1);
    let b = pedersen_commitment_with_separator([1], 0);
    let result = a + b;

    // if we use different domain separators, the result should be different
    let mut not_expected = pedersen_commitment_with_separator([2], 0);
    assert(result != not_expected);
    not_expected = pedersen_commitment_with_separator([2], 1);
    assert(result != not_expected);
}

#[test]
fn test_filling_a_missing_value() {
    let nada = pedersen_commitment_with_separator([0], 0);
    let x = pedersen_commitment_with_separator([42], 0);
    let result = nada + x - nada;

    assert(result == x);
}
