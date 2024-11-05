use dep::aztec::prelude::{NoteHeader, NoteInterface, NullifiableNote, PrivateContext};

use dep::aztec::{
    note::utils::compute_note_hash_for_nullify, keys::getters::{get_nsk_app, get_public_keys},
    protocol_types::{address::AztecAddress, constants::GENERATOR_INDEX__NOTE_NULLIFIER, hash::poseidon2_hash_with_separator},
    macros::notes::note_custom_interface, generators::Ga1 as Gx_1, generators::Ga2 as Gx_2,
    generators::Ga3 as Gy_1, generators::Ga4 as Gy_2, generators::Ga5 as G_owner, generators::G_slot
};

use std::hash::from_field_unsafe;

global ECDSA_PUBLIC_KEY_NOTE_LEN: u32 = 5;

// Stores an ECDSA public key composed of two 32-byte elements
// TODO: Do we need to include a nonce, in case we want to read/nullify/recreate with the same pubkey value?
#[note_custom_interface]
pub struct EcdsaPublicKeyNote {
    x: [u8; 32],
    y: [u8; 32],
    owner: AztecAddress,
}

impl NoteInterface<ECDSA_PUBLIC_KEY_NOTE_LEN> for EcdsaPublicKeyNote {
    // Cannot use the automatic serialization since x and y don't fit. Serialize the note as 5 fields where:
    // [0] = x[0..31] (upper bound excluded)
    // [1] = x[31]
    // [2] = y[0..31]
    // [3] = y[31]
    // [4] = owner
    fn serialize_content(self) -> [Field; ECDSA_PUBLIC_KEY_NOTE_LEN] {
        let mut x: Field = 0;
        let mut y: Field = 0;
        let mut mul: Field = 1;

        for i in 1..32 {
            let byte_x: Field = self.x[31 - i] as Field;
            x = x + (byte_x * mul);
            let byte_y: Field = self.y[31 - i] as Field;
            y = y + (byte_y * mul);
            mul *= 256;
        }

        let last_x = self.x[31] as Field;
        let last_y = self.y[31] as Field;

        [x, last_x, y, last_y, self.owner.to_field()]
    }

    // Cannot use the automatic deserialization for the aforementioned reasons
    fn deserialize_content(serialized_note: [Field; ECDSA_PUBLIC_KEY_NOTE_LEN]) -> EcdsaPublicKeyNote {
        let mut x: [u8; 32] = [0; 32];
        let mut y: [u8; 32] = [0; 32];

        let part_x:[u8; 32] = serialized_note[0].to_be_bytes();
        for i in 0..31 {
            x[i] = part_x[i + 1];
        }
        x[31] = serialized_note[1].to_be_bytes::<32>()[31];

        let part_y:[u8; 32] = serialized_note[2].to_be_bytes();
        for i in 0..31 {
            y[i] = part_y[i + 1];
        }
        y[31] = serialized_note[3].to_be_bytes::<32>()[31];

        EcdsaPublicKeyNote { x, y, owner: AztecAddress::from_field(serialized_note[4]), header: NoteHeader::empty() }
    }

    fn to_be_bytes(self, storage_slot: Field) -> [u8; ECDSA_PUBLIC_KEY_NOTE_LEN * 32 + 64] {
        let serialized_note = self.serialize_content();

        let mut buffer: [u8; ECDSA_PUBLIC_KEY_NOTE_LEN * 32 + 64] = [0; ECDSA_PUBLIC_KEY_NOTE_LEN * 32 + 64];

        let storage_slot_bytes: [u8; 32] = storage_slot.to_be_bytes();
        let note_type_id_bytes: [u8; 32] = EcdsaPublicKeyNote::get_note_type_id().to_be_bytes();

        for i in 0..32 {
            buffer[i] = storage_slot_bytes[i];
            buffer[32 + i] = note_type_id_bytes[i];
        }

        for i in 0..serialized_note.len() {
            let bytes: [u8; 32] = serialized_note[i].to_be_bytes();
            for j in 0..32 {
                buffer[64 + i * 32 + j] = bytes[j];
            }
        }
        buffer
    }

    fn get_note_type_id() -> Field {
        comptime
        {
            let bytes = "EcdsaPublicKeyNote".as_bytes();
            let hash = aztec::protocol_types::hash::poseidon2_hash_bytes(bytes);
            let hash_bytes = hash.to_be_bytes::<4>();
            aztec::protocol_types::utils::field::field_from_bytes(hash_bytes, true)
        }
    }

    fn get_header(self) -> NoteHeader {
        self.header
    }

    fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }

    fn compute_note_hash(self) -> Field {
        let serialized = self.serialize_content();
        std::embedded_curve_ops::multi_scalar_mul(
            [Gx_1, Gx_2, Gy_1, Gy_2, G_owner, G_slot],
            [
            from_field_unsafe(serialized[0]),
            from_field_unsafe(serialized[1]),
            from_field_unsafe(serialized[2]),
            from_field_unsafe(serialized[3]),
            from_field_unsafe(serialized[4]),
            from_field_unsafe(self.get_header().storage_slot)
        ]
        ).x
    }
}

impl NullifiableNote for EcdsaPublicKeyNote {

    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field {
        let owner_npk_m_hash = get_public_keys(self.owner).npk_m.hash();
        let secret = context.request_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }

    unconstrained fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        let owner_npk_m_hash = get_public_keys(self.owner).npk_m.hash();
        let secret = get_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [
            note_hash_for_nullify,
            secret
        ],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field
        )
    }
}

impl EcdsaPublicKeyNote {
    pub fn new(x: [u8; 32], y: [u8; 32], owner: AztecAddress) -> Self {
        EcdsaPublicKeyNote { x, y, owner, header: NoteHeader::empty() }
    }
}
