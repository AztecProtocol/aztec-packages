use dep::aztec::{
    generators::{Ga1 as G_tid, Ga2 as G_npk, Ga3 as G_rnd, G_slot},
    note::utils::compute_note_hash_for_nullify, keys::getters::get_nsk_app,
    oracle::unsafe_rand::unsafe_rand,
    prelude::{AztecAddress, NoteInterface, NoteHeader, PrivateContext},
    protocol_types::{
    constants::GENERATOR_INDEX__NOTE_NULLIFIER, point::{Point, POINT_LENGTH},
    hash::poseidon2_hash_with_separator, traits::{Empty, Eq, Deserialize, Serialize}
}
};
use std::{embedded_curve_ops::multi_scalar_mul, hash::from_field_unsafe};

global NFT_NOTE_LEN: Field = 3;
// NFT_NOTE_LEN * 32 + 32(storage_slot as bytes) + 32(note_type_id as bytes)
global NFT_NOTE_BYTES_LEN: Field = 3 * 32 + 64;

#[aztec(note)]
struct NFTNote {
    // ID of the token
    token_id: Field,
    // The nullifying public key hash is used with the nsk_app to ensure that the note can be privately spent.
    npk_m_hash: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}

impl NoteInterface<NFT_NOTE_LEN, NFT_NOTE_BYTES_LEN> for NFTNote {
    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field {
        let secret = context.request_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        let secret = get_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }

    fn compute_note_hiding_point(self) -> Point {
        // We use the unsafe version because `multi_scalar_mul` will constrain the scalars.
        let token_id_scalar = from_field_unsafe(self.token_id);
        let npk_m_hash_scalar = from_field_unsafe(self.npk_m_hash);
        let randomness_scalar = from_field_unsafe(self.randomness);
        let slot_scalar = from_field_unsafe(self.header.storage_slot);

        multi_scalar_mul(
            [G_tid, G_npk, G_rnd, G_slot],
            [token_id_scalar, npk_m_hash_scalar, randomness_scalar, slot_scalar]
        )
    }
}

impl NFTNote {
    pub fn new(token_id: Field, npk_m_hash: Field) -> Self {
        let randomness = unsafe {
            unsafe_rand()
        };
        NFTNote { token_id, npk_m_hash, randomness, header: NoteHeader::empty() }
    }
}

impl Eq for NFTNote {
    fn eq(self, other: Self) -> bool {
        (self.token_id == other.token_id)
            & (self.npk_m_hash == other.npk_m_hash)
            & (self.randomness == other.randomness)
    }
}

// TODO(#8290): Auto-generate this
struct NFTNoteHidingPoint {
  inner: Point
}

impl NFTNoteHidingPoint {
    // TODO(#8238): Remove the randomness argument below
    fn new(npk_m_hash: Field, storage_slot: Field, randomness: Field) -> Self {
        // TODO(#8238): And uncomment this
        // let randomness = unsafe {
        //     unsafe_rand()
        // };
        let note = NFTNote {
            header: NoteHeader { contract_address: AztecAddress::zero(), nonce: 0, storage_slot, note_hash_counter: 0 },
            token_id: 0,
            npk_m_hash,
            randomness
        };
        Self { inner: note.compute_note_hiding_point() }
    }

    fn finalize(self, token_id: Field) -> Field {
        let finalized_hiding_point = multi_scalar_mul([G_tid], [from_field_unsafe(token_id)]) + self.inner;
        finalized_hiding_point.x
    }
}

impl Serialize<POINT_LENGTH> for NFTNoteHidingPoint {
    fn serialize(self) -> [Field; POINT_LENGTH] {
        self.inner.serialize()
    }
}

impl Deserialize<POINT_LENGTH> for NFTNoteHidingPoint {
    fn deserialize(serialized: [Field; POINT_LENGTH]) -> NFTNoteHidingPoint {
        NFTNoteHidingPoint { inner: Point::deserialize(serialized) }
    }
}

impl Empty for NFTNoteHidingPoint {
    fn empty() -> Self {
        Self { inner: Point::empty() }
    }
}

impl Eq for NFTNoteHidingPoint {
    fn eq(self, other: Self) -> bool {
        self.inner == other.inner
    }
}
