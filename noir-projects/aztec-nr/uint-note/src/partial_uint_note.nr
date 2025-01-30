use dep::aztec::{
    generators::{G_slot, Ga2, Ga3},
    note::note_interface::NoteInterface,
    oracle::random::random,
    prelude::NoteHeader,
    protocol_types::{address::AztecAddress, point::Point, traits::{Empty, Packable, ToField}},
};
use std::static_assert;

use crate::uint_note::UintNote;

pub struct PartialUintNote {
    pub owner: AztecAddress,
    pub randomness: Field,
    pub hiding_point: PartialUintNoteHidingPoint,
    pub header: NoteHeader,
}

impl PartialUintNote {
    pub fn new(owner: AztecAddress, storage_slot: Field) -> Self {
        /// Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
        /// so a malicious sender could use non-random values to make the note less private. But they already know
        /// the full note pre-image anyway, and so the recipient already trusts them to not disclose this
        /// information. We can therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        let mut header = NoteHeader::empty();
        header.storage_slot = storage_slot;

        let hiding_point = PartialUintNoteHidingPoint::new(
            std::embedded_curve_ops::multi_scalar_mul(
                [Ga2, Ga3, G_slot],
                [
                    std::hash::from_field_unsafe(owner.pack()[0]),
                    std::hash::from_field_unsafe(randomness.pack()[0]),
                    std::hash::from_field_unsafe(storage_slot),
                ],
            ),
        );

        Self { owner, randomness, hiding_point, header }
    }
}

global PARTIAL_UINT_NOTE_SER_LENGTH: u32 = 3;

impl NoteInterface<PARTIAL_UINT_NOTE_SER_LENGTH> for PartialUintNote {
    fn pack_content(self) -> [Field; PARTIAL_UINT_NOTE_SER_LENGTH] {
        [self.hiding_point.value.x, self.owner.to_field(), self.randomness]
    }

    fn unpack_content(_fields: [Field; PARTIAL_UINT_NOTE_SER_LENGTH]) -> Self {
        static_assert(false, "unsupported");
        panic(f"unsupported")
    }

    fn get_header(self) -> NoteHeader {
        self.header
    }

    fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }

    fn get_note_type_id() -> Field {
        UintNote::get_note_type_id() + 128
    }

    fn compute_note_hash(self) -> Field {
        static_assert(false, "unsupported");
        panic(f"unsupported")
    }
}

pub struct PartialUintNoteHidingPoint {
    pub value: Point,
}

impl PartialUintNoteHidingPoint {
    fn new(value: Point) -> Self {
        Self { value }
    }

    fn complete(self, amount: U128) -> Field {
        let note_point = self.value
            + std::embedded_curve_ops::multi_scalar_mul(
                [G_slot],
                [std::hash::from_field_unsafe(amount.pack()[0])],
            );

        note_point.x
    }
}
