use crate::note::note_interface::NoteInterface;
use crate::event::event_interface::EventInterface;
use dep::protocol_types::{scalar::Scalar, point::Point};

use std::aes128::aes128_encrypt;
use crate::keys::point_to_symmetric_key::point_to_symmetric_key;

struct EncryptedLogIncomingBody<let M: u32> {
    plaintext: [u8; M]
}

impl<let M: u32> EncryptedLogIncomingBody<M> {
    pub fn from_note<T, let N: u32>(note: T, storage_slot: Point) -> Self where T: NoteInterface<N, M> {
        let mut plaintext = note.to_be_bytes(storage_slot);
        EncryptedLogIncomingBody { plaintext }
    }

    pub fn from_event<T, let MR: u32>(
        event: T,
        randomness: Field
    ) -> Self where T: EventInterface<M, MR> {
        let mut plaintext = event.private_to_be_bytes(randomness);
        EncryptedLogIncomingBody { plaintext }
    }

    pub fn compute_ciphertext(self, eph_sk: Scalar, ivpk: Point) -> [u8] {
        let full_key = point_to_symmetric_key(eph_sk, ivpk);
        let mut sym_key = [0; 16];
        let mut iv = [0; 16];

        for i in 0..16 {
            sym_key[i] = full_key[i];
            iv[i] = full_key[i + 16];
        }
        aes128_encrypt(self.plaintext, iv, sym_key)
    }
}

mod test {
    use dep::protocol_types::{
        address::AztecAddress, traits::Empty, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        scalar::Scalar, point::Point, traits::Serialize, generators::Ga1,
        abis::event_selector::EventSelector
    };

    use crate::{
        note::{note_header::NoteHeader, note_interface::NoteInterface},
        encrypted_logs::incoming_body::EncryptedLogIncomingBody, event::event_interface::EventInterface,
        oracle::unsafe_rand::unsafe_rand, context::PrivateContext, utils::point::point_to_bytes
    };

    struct AddressNote {
        address: AztecAddress,
        owner: AztecAddress,
        randomness: Field,
        header: NoteHeader,
    }

    global ADDRESS_NOTE_LEN: Field = 3;
    global ADDRESS_NOTE_BYTES_LEN = 32 * 3 + 64;

    impl NoteInterface<ADDRESS_NOTE_LEN, ADDRESS_NOTE_BYTES_LEN> for AddressNote {
        fn compute_note_content_hash(self) -> Point {
            Ga1
        }

        fn get_note_type_id() -> Field {
            1
        }

        fn get_header(self) -> NoteHeader { self.header}

        fn set_header(&mut self, header: NoteHeader) {self.header = header; }

        fn compute_note_hash_and_nullifier(_self: Self, _context: &mut PrivateContext) -> (Field, Field) {
            (1, 1)
        }

        fn compute_note_hash_and_nullifier_without_context(_self: Self) -> (Field, Field) {(1,1)}

        fn serialize_content(self) -> [Field; ADDRESS_NOTE_LEN] { [self.address.to_field(), self.owner.to_field(), self.randomness]}

        fn deserialize_content(fields: [Field; ADDRESS_NOTE_LEN]) -> Self {
            AddressNote { address: AztecAddress::from_field(fields[0]), owner: AztecAddress::from_field(fields[1]), randomness: fields[2], header: NoteHeader::empty() }
        }

        fn to_be_bytes(self, storage_slot: Point) -> [u8; ADDRESS_NOTE_BYTES_LEN] {
            let serialized_note = self.serialize_content();

            let mut buffer: [u8; ADDRESS_NOTE_BYTES_LEN] = [0; ADDRESS_NOTE_BYTES_LEN];

            let storage_slot_bytes = point_to_bytes(storage_slot);
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

    impl AddressNote {
        pub fn new(address: AztecAddress, owner: AztecAddress, randomness: Field) -> Self {
            AddressNote { address, owner, randomness, header: NoteHeader::empty() }
        }
    }

    #[test]
    fn test_encrypted_note_log_incoming_body() {
        let note = AddressNote::new(
            AztecAddress::from_field(0x1),
            AztecAddress::from_field(0x2),
            3
        );

        let storage_slot = Point {
            x: 0x1d83b1af3f569775af9e3fdae19b84590245098f46d4a407b5963f313000ce37,
            y: 0x1537c632779932ccbc415d91dd70801f88ad410fff48179886d3dce035582d76,
            is_infinite: false
        };

        let eph_sk = Scalar {
            lo: 0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd,
            hi: 0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06
        };
        let ivpk = Point {
            x: 0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
            y: 0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e,
            is_infinite: false
        };

        let body = EncryptedLogIncomingBody::from_note(note, storage_slot);

        let ciphertext = body.compute_ciphertext(eph_sk, ivpk);

        let expected_note_body_ciphertext = [
            75, 3, 86, 165, 50, 163, 229, 200, 67, 137, 31, 92, 122, 27, 14, 158, 201, 248, 29, 236, 102, 216, 246, 64, 166, 1, 166, 221, 92, 19, 78, 19, 213, 197, 44, 130, 105, 145, 239, 139, 176, 255, 148, 41, 72, 212, 75, 176, 216, 99, 170, 9, 151, 25, 135, 140, 53, 123, 253, 52, 119, 14, 65, 131, 127, 177, 227, 219, 157, 38, 90, 161, 32, 7, 27, 138, 152, 196, 60, 240, 106, 73, 121, 227, 190, 14, 142, 61, 119, 47, 201, 29, 250, 68, 53, 62, 200, 33, 207, 190, 156, 84, 9, 115, 122, 14, 147, 171, 83, 111, 2, 140, 9, 33, 33, 30, 65, 242, 133, 134, 59, 254, 202, 2, 237, 246, 68, 153, 62, 237, 123, 90, 169, 84, 62, 55, 214, 102, 26, 79, 209, 175, 255, 223, 110, 6, 119, 61, 142, 36, 81, 155, 0, 178, 60, 85, 120, 152, 177, 115, 14, 62, 105, 42, 178, 231, 173, 245, 88, 245, 89, 122, 32, 49, 205, 151
        ];

        assert_eq(expected_note_body_ciphertext.len(), ciphertext.len());

        for i in 0..expected_note_body_ciphertext.len() {
            assert_eq(ciphertext[i], expected_note_body_ciphertext[i]);
        }
    }

    struct TestEvent {
        value0: Field,
        value1: Field,
        value2: Field,
    }

    impl Serialize<3> for TestEvent {
        fn serialize(self) -> [Field; 3] {
            [self.value0, self.value1, self.value2]
        }
    }

    global TEST_EVENT_LEN: Field = 3;
    global TEST_EVENT_BYTES_LEN = 32 * 3 + 64;
    global TEST_EVENT_BYTES_LEN_WITHOUT_RANDOMNESS = 32 * 3 + 32;

    impl EventInterface<TEST_EVENT_BYTES_LEN, TEST_EVENT_BYTES_LEN_WITHOUT_RANDOMNESS> for TestEvent {
        fn get_event_type_id() -> EventSelector {
            EventSelector::from_signature("TestEvent(Field,Field,Field)")
        }

        fn private_to_be_bytes(self, randomness: Field) -> [u8; TEST_EVENT_BYTES_LEN] {
            let mut buffer: [u8; TEST_EVENT_BYTES_LEN] = [0; TEST_EVENT_BYTES_LEN];

            let randomness_bytes = randomness.to_be_bytes(32);
            let event_type_id_bytes = TestEvent::get_event_type_id().to_field().to_be_bytes(32);

            for i in 0..32 {
                buffer[i] = randomness_bytes[i];
                buffer[32 + i] = event_type_id_bytes[i];
            }

            let serialized_event = self.serialize();

            for i in 0..serialized_event.len() {
                let bytes = serialized_event[i].to_be_bytes(32);
                for j in 0..32 {
                    buffer[64 + i * 32 + j] = bytes[j];
                }
            }

            buffer
        }

        fn to_be_bytes(self) -> [u8; TEST_EVENT_BYTES_LEN_WITHOUT_RANDOMNESS] {
             let mut buffer: [u8; TEST_EVENT_BYTES_LEN_WITHOUT_RANDOMNESS] = [0; TEST_EVENT_BYTES_LEN_WITHOUT_RANDOMNESS];

             let event_type_id_bytes = TestEvent::get_event_type_id().to_field().to_be_bytes(32);

             for i in 0..32 {
                 buffer[i] = event_type_id_bytes[i];
            }

             let serialized_event = self.serialize();

             for i in 0..serialized_event.len() {
                 let bytes = serialized_event[i].to_be_bytes(32);
                 for j in 0..32 {
                     buffer[32 + i * 32 + j] = bytes[j];
                }
            }

             buffer
        }

        fn emit<Env>(self, _emit: fn[Env](Self) -> ()) {
            _emit(self);
        }
    }

    #[test]
    fn test_encrypted_log_event_incoming_body() {
        let test_event = TestEvent { value0: 1, value1: 2, value2: 3 };

        let eph_sk = Scalar {
            lo: 0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd,
            hi: 0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06
        };

        let ivpk = Point {
            x: 0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
            y: 0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e,
            is_infinite: false
        };

        let randomness = 2;

        let body = EncryptedLogIncomingBody::from_event(test_event, randomness);

        let ciphertext = body.compute_ciphertext(eph_sk, ivpk);

        let expected_event_body_ciphertext = [
            226, 240, 253, 6, 28, 52, 19, 131, 33, 132, 178, 212, 245, 62, 14, 190, 147, 228, 160, 190, 146, 61, 95, 203, 124, 153, 68, 168, 17, 150, 92, 0, 99, 214, 85, 64, 191, 78, 157, 131, 149, 96, 236, 253, 96, 172, 157, 30, 185, 29, 14, 152, 216, 130, 219, 151, 80, 185, 43, 223, 167, 8, 89, 189, 88, 188, 101, 137, 255, 136, 84, 252, 79, 18, 52, 3, 110, 54, 54, 206, 244, 209, 246, 226, 207, 247, 143, 253, 211, 75, 160, 224, 172, 41, 45, 7, 208, 137, 90, 56, 59, 4, 234, 48, 53, 23, 130, 230, 49, 249, 142, 243, 170, 72, 183, 242, 49, 124, 46, 52, 198, 75, 55, 102, 56, 89, 254, 67, 59, 157, 249, 120, 184, 67, 154, 16, 148, 227, 93, 37, 120, 199, 93, 166, 80, 127, 173, 52, 80, 135, 87, 1, 168, 164, 51, 48, 126, 120, 47, 102, 211, 227, 234, 170, 208, 99, 111, 198, 170, 226, 156, 244, 241, 174, 206, 30
        ];

        assert_eq(expected_event_body_ciphertext.len(), ciphertext.len());

        for i in 0..expected_event_body_ciphertext.len() {
            assert_eq(ciphertext[i], expected_event_body_ciphertext[i]);
        }
    }
}
