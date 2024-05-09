use crate::note::{note_interface::NoteInterface};
use dep::protocol_types::{grumpkin_private_key::GrumpkinPrivateKey, grumpkin_point::GrumpkinPoint};

use dep::std::aes128::aes128_encrypt;
use dep::std::println;
use crate::keys::point_to_symmetric_key::point_to_symmetric_key;

trait EncryptableNote<N> {
        fn to_bytes(self, storage_slot: Field) -> [u8; N];
    }

struct EncryptedLogBody<Note> {
        storage_slot: Field,
        note: Note,
    }

impl<Note> EncryptedLogBody<Note> {
    pub fn new<N, M>(
        storage_slot: Field,
        note: Note
    ) -> Self where Note: NoteInterface<N>, Note: EncryptableNote<M> {
        Self { storage_slot, note }
    }

    pub fn compute_ciphertext<N, M>(
        self,
        secret: GrumpkinPrivateKey,
        point: GrumpkinPoint
    ) -> [u8] where Note: NoteInterface<N>, Note: EncryptableNote<M> {
        let buffer = self.note.to_bytes(self.storage_slot);

        let full_key = point_to_symmetric_key(secret, point);
        let mut sym_key = [0; 16];
        let mut iv = [0; 16];

        for i in 0..16 {
            sym_key[i] = full_key[i];
            iv[i] = full_key[i + 16];
        }
        aes128_encrypt(buffer, iv, sym_key)
    }
}

mod test {
    use crate::encrypted_logs::body::EncryptedLogBody;
    use crate::encrypted_logs::body::EncryptableNote;
    use dep::protocol_types::{
        address::AztecAddress, traits::Empty, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        grumpkin_private_key::GrumpkinPrivateKey, grumpkin_point::GrumpkinPoint
    };

    use crate::{
        note::{note_header::NoteHeader, note_interface::NoteInterface, utils::compute_note_hash_for_consumption},
        oracle::{unsafe_rand::unsafe_rand, nullifier_key::get_app_nullifier_secret_key, get_public_key::get_public_key},
        context::PrivateContext, hash::poseidon2_hash
    };

    struct AddressNote {
        address: AztecAddress,
        owner: AztecAddress,
        randomness: Field,
        header: NoteHeader,
    }

    global ADDRESS_NOTE_LEN: Field = 3;
    global ENCRYPTED_ADDRESS_NOTE_LEN: u64 = 3 * 32 + 64 + 16;

    impl EncryptableNote<ENCRYPTED_ADDRESS_NOTE_LEN> for AddressNote {
        fn to_bytes(self, storage_slot: Field) -> [u8; ENCRYPTED_ADDRESS_NOTE_LEN] {
            let serialized_note: [Field; ADDRESS_NOTE_LEN] = self.serialize_content();

            let mut buffer: [u8; ENCRYPTED_ADDRESS_NOTE_LEN] = [0; ENCRYPTED_ADDRESS_NOTE_LEN];

            let storage_slot_bytes = storage_slot.to_be_bytes(32);
            let note_type_id_bytes = AddressNote::get_note_type_id().to_be_bytes(32);

            for i in 0..32 {
                buffer[i] = storage_slot_bytes[i];
                buffer[32 + i] = note_type_id_bytes[i];
            }

            for i in 0..serialized_note.len() {
                let bytes = serialized_note[i].to_be_bytes(32);
                for j in 0..32 {
                    buffer[64 + i * 32 + j] = bytes[j];
                }
            }
            buffer
        }
    }

    impl NoteInterface<ADDRESS_NOTE_LEN> for AddressNote {
        fn compute_note_content_hash(self) -> Field {1}

        fn get_note_type_id() -> Field {2}

        fn get_header(self) -> NoteHeader { self.header}

        fn set_header(&mut self, header: NoteHeader) {self.header = header; }

        fn compute_nullifier(self, context: &mut PrivateContext) -> Field {1}

        fn compute_nullifier_without_context(self) -> Field {1}

        fn broadcast(self, context: &mut PrivateContext, slot: Field) {}

        fn serialize_content(self) -> [Field; ADDRESS_NOTE_LEN] { [self.address.to_field(), self.owner.to_field(), self.randomness]}

        fn deserialize_content(fields: [Field; ADDRESS_NOTE_LEN]) -> Self {
            AddressNote { address: AztecAddress::from_field(fields[0]), owner: AztecAddress::from_field(fields[1]), randomness: fields[2], header: NoteHeader::empty() }
        }
    }

    impl AddressNote {
        pub fn new(address: AztecAddress, owner: AztecAddress, randomness: Field) -> Self {
            AddressNote { address, owner, randomness, header: NoteHeader::empty() }
        }
        // docs:end:address_note_def
    }

    #[test]
    fn test_encrypted_log_body() {
        let note = AddressNote::new(
            AztecAddress::from_field(0x1),
            AztecAddress::from_field(0x2),
            3
        );

        let note_type_id = 1;
        let storage_slot = 2;
        let body = EncryptedLogBody::new(storage_slot, note);

        let secret = GrumpkinPrivateKey::new(
            0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06,
            0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd
        );
        let point = GrumpkinPoint::new(
            0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
            0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e
        );

        let ciphertext = body.compute_ciphertext(secret, point);

        let expected_body_ciphertext = [
            131, 119, 105, 129, 244, 32, 151, 205, 12, 99, 93, 62, 10, 180, 72, 21, 36, 194, 14, 168, 0, 137, 126, 59, 151, 177, 136, 254, 153, 190, 92, 33, 40, 151, 178, 54, 34, 166, 124, 96, 117, 108, 168, 7, 147, 222, 81, 201, 254, 170, 244, 151, 60, 64, 226, 45, 156, 185, 53, 23, 121, 63, 243, 101, 134, 21, 167, 39, 226, 203, 162, 223, 28, 74, 244, 159, 54, 201, 192, 168, 19, 85, 103, 82, 148, 3, 153, 210, 89, 245, 171, 171, 12, 248, 40, 74, 199, 65, 96, 42, 84, 83, 48, 21, 188, 134, 45, 247, 134, 166, 109, 170, 68, 212, 99, 235, 74, 202, 162, 108, 130, 128, 122, 16, 79, 242, 30, 157, 26, 75, 57, 24, 18, 124, 217, 74, 155, 13, 171, 205, 194, 193, 103, 134, 224, 204, 46, 105, 135, 166, 192, 163, 186, 42, 71, 51, 156, 161, 8, 131
        ];
        for i in 0..expected_body_ciphertext.len() {
            assert_eq(ciphertext[i], expected_body_ciphertext[i]);
        }
    }
}
