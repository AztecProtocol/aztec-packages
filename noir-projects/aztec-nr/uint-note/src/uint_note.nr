use dep::aztec::{
    generators::{Ga1 as G_amt, Ga2 as G_npk, Ga3 as G_rnd, G_slot},
    prelude::{NoteHeader, NoteInterface, PrivateContext},
    protocol_types::{
    constants::GENERATOR_INDEX__NOTE_NULLIFIER, point::{Point, POINT_LENGTH}, scalar::Scalar,
    hash::poseidon2_hash_with_separator, traits::Serialize
},
    note::utils::compute_note_hash_for_nullify, oracle::unsafe_rand::unsafe_rand,
    keys::getters::get_nsk_app
};
use dep::std::{embedded_curve_ops::multi_scalar_mul, hash::from_field_unsafe};

global UINT_NOTE_LEN: Field = 3; // 3 plus a header.
global UINT_NOTE_BYTES_LEN: Field = 3 * 32 + 64;

#[aztec(note)]
struct UintNote {
    // The integer stored by the note
    value: U128,
    // The nullifying public key hash is used with the nsk_app to ensure that the note can be privately spent.
    npk_m_hash: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}

impl NoteInterface<UINT_NOTE_LEN, UINT_NOTE_BYTES_LEN> for UintNote {
    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field {
        let secret = context.request_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator([
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        let secret = get_nsk_app(self.npk_m_hash);
        poseidon2_hash_with_separator([note_hash_for_nullify, secret],GENERATOR_INDEX__NOTE_NULLIFIER)
    }

    fn compute_note_hiding_point(self) -> Point {
        // We use the unsafe version because the multi_scalar_mul will constrain the scalars.
        let amount_scalar = from_field_unsafe(self.value.to_integer());
        let npk_m_hash_scalar = from_field_unsafe(self.npk_m_hash);
        let randomness_scalar = from_field_unsafe(self.randomness);
        let slot_scalar = from_field_unsafe(self.header.storage_slot);
        // We compute the note hiding point as:
        //     `G_amt * amount + G_npk * npk_m_hash + G_rnd * randomness + G_slot * slot`
        // instead of using pedersen or poseidon2 because it allows us to privately add and subtract from amount
        // in public by leveraging homomorphism.
        multi_scalar_mul(
            [G_amt, G_npk, G_rnd, G_slot],
            [amount_scalar, npk_m_hash_scalar, randomness_scalar, slot_scalar]
        )
    }
}

impl UintNote {
    // TODO: Merge this func with `compute_note_hiding_point`. I (benesjan) didn't do it in the initial PR to not have
    // to modify macros and all the related funcs in it.
    fn to_note_hiding_point(self) -> UintNoteHidingPoint {
        UintNoteHidingPoint::new(self.compute_note_hiding_point())
    }
}

struct UintNoteHidingPoint {
  inner: Point
}

impl UintNoteHidingPoint {
    fn new(point: Point) -> Self {
        Self { inner: point }
    }

    fn add_amount(&mut self, amount: U128) {
        self.inner = multi_scalar_mul([G_amt], [from_field_unsafe(amount.to_integer())]) + self.inner;
    }

    fn add_npk_m_hash(&mut self, npk_m_hash: Field) {
        self.inner = multi_scalar_mul([G_npk], [from_field_unsafe(npk_m_hash)]) + self.inner;
    }

    fn add_randomness(&mut self, randomness: Field) {
        self.inner = multi_scalar_mul([G_rnd], [from_field_unsafe(randomness)]) + self.inner;
    }

    fn add_slot(&mut self, slot: Field) {
        self.inner = multi_scalar_mul([G_slot], [from_field_unsafe(slot)]) + self.inner;
    }

    fn finalize(self) -> Field {
        self.inner.x
    }
}

impl Serialize<POINT_LENGTH> for UintNoteHidingPoint {
    fn serialize(self) -> [Field; POINT_LENGTH] {
        self.inner.serialize()
    }
}

impl Eq for UintNote {
    fn eq(self, other: Self) -> bool {
        (self.value == other.value) &
        (self.npk_m_hash == other.npk_m_hash) &
        (self.randomness == other.randomness)
    }
}
