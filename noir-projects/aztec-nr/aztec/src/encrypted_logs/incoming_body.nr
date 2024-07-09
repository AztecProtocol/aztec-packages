use crate::note::note_interface::NoteInterface;
use crate::event::event_interface::EventInterface;
use dep::protocol_types::{grumpkin_private_key::GrumpkinPrivateKey, embedded_curve_point::EmbeddedCurvePoint};

use std::aes128::aes128_encrypt;
use crate::keys::point_to_symmetric_key::point_to_symmetric_key;

struct EncryptedLogIncomingBody<M> {
    plaintext: [u8; M]
}

impl<M> EncryptedLogIncomingBody<M> {
    pub fn from_note<T, N>(note: T, storage_slot: Field) -> Self where T: NoteInterface<N, M> {
        let mut plaintext = note.to_be_bytes(storage_slot);
        EncryptedLogIncomingBody { plaintext }
    }

    pub fn from_event<T, MR>(event: T, randomness: Field) -> Self where T: EventInterface<M, MR> {
        let mut plaintext = event.private_to_be_bytes(randomness);
        EncryptedLogIncomingBody { plaintext }
    }

    pub fn compute_ciphertext(self, eph_sk: GrumpkinPrivateKey, ivpk_app: EmbeddedCurvePoint) -> [u8] {
        let full_key = point_to_symmetric_key(eph_sk, ivpk_app);
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
    use crate::encrypted_logs::incoming_body::EncryptedLogIncomingBody;
    use dep::protocol_types::{
        address::AztecAddress, traits::Empty, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        grumpkin_private_key::GrumpkinPrivateKey, embedded_curve_point::EmbeddedCurvePoint,
        traits::Serialize, abis::event_selector::EventSelector
    };

    use crate::{
        note::{note_header::NoteHeader, note_interface::NoteInterface},
        event::event_interface::EventInterface, oracle::unsafe_rand::unsafe_rand,
        context::PrivateContext
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
        fn compute_note_content_hash(self) -> Field {1}

        fn get_note_type_id() -> Field {
            1
        }

        fn get_header(self) -> NoteHeader { self.header}

        fn set_header(&mut self, header: NoteHeader) {self.header = header; }

        fn compute_note_hash_and_nullifier(self, context: &mut PrivateContext) -> (Field, Field) {
            (1, 1)
        }

        fn compute_note_hash_and_nullifier_without_context(self) -> (Field, Field) {(1,1)}

        fn serialize_content(self) -> [Field; ADDRESS_NOTE_LEN] { [self.address.to_field(), self.owner.to_field(), self.randomness]}

        fn deserialize_content(fields: [Field; ADDRESS_NOTE_LEN]) -> Self {
            AddressNote { address: AztecAddress::from_field(fields[0]), owner: AztecAddress::from_field(fields[1]), randomness: fields[2], header: NoteHeader::empty() }
        }

        fn to_be_bytes(self, storage_slot: Field) -> [u8; ADDRESS_NOTE_BYTES_LEN] {
            let serialized_note = self.serialize_content();

            let mut buffer: [u8; ADDRESS_NOTE_BYTES_LEN] = [0; ADDRESS_NOTE_BYTES_LEN];

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

        let storage_slot = 2;

        let eph_sk = GrumpkinPrivateKey::new(
            0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06,
            0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd
        );
        let ivpk_app = EmbeddedCurvePoint::new(
            0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
            0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e,
            false
        );

        let body = EncryptedLogIncomingBody::from_note(note, storage_slot);

        let ciphertext = body.compute_ciphertext(eph_sk, ivpk_app);

        let expected_note_body_ciphertext = [
            231, 126, 15, 225, 68, 138, 75, 80, 237, 178, 203, 27, 105, 200, 174, 176, 146, 101, 227, 84, 19, 141, 176, 40, 103, 223, 229, 126, 222, 105, 170, 224, 249, 151, 56, 93, 118, 197, 151, 127, 30, 134, 137, 202, 95, 116, 88, 231, 209, 202, 89, 216, 98, 2, 229, 16, 96, 177, 39, 242, 238, 33, 93, 55, 89, 97, 234, 58, 68, 38, 249, 92, 213, 43, 143, 227, 206, 44, 189, 32, 199, 145, 223, 82, 7, 112, 231, 39, 160, 18, 133, 37, 150, 253, 195, 89, 48, 17, 247, 165, 222, 3, 163, 23, 147, 31, 8, 134, 153, 42, 82, 12, 86, 136, 145, 240, 247, 194, 70, 154, 14, 125, 46, 104, 226, 105, 244, 129, 56, 108, 115, 144, 7, 178, 102, 183, 52, 122, 79, 97, 126, 98, 109, 213, 97, 65, 23, 191, 212, 215, 228, 245, 115, 24, 79, 29, 71, 150, 3, 168, 17, 234, 240, 21, 6, 203, 120, 148, 69, 111, 248, 6, 197, 26, 210, 92
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

        let eph_sk = GrumpkinPrivateKey::new(
            0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06,
            0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd
        );

        let ivpk_app = EmbeddedCurvePoint::new(
            0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
            0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e,
            false
        );

        let randomness = 2;

        let body = EncryptedLogIncomingBody::from_event(test_event, randomness);

        let ciphertext = body.compute_ciphertext(eph_sk, ivpk_app);

        let expected_event_body_ciphertext = [
            231, 126, 15, 225, 68, 138, 75, 80, 237, 178, 203, 27, 105, 200, 174, 176, 146, 101, 227, 84, 19, 141, 176, 40, 103, 223, 229, 126, 222, 105, 170, 224, 249, 151, 56, 93, 118, 197, 151, 127, 30, 134, 137, 202, 95, 116, 88, 231, 7, 213, 168, 102, 8, 55, 153, 213, 237, 203, 108, 79, 186, 177, 75, 174, 92, 210, 10, 64, 218, 238, 74, 244, 235, 242, 5, 99, 214, 188, 183, 84, 109, 135, 104, 177, 167, 71, 193, 194, 88, 135, 220, 197, 150, 145, 62, 103, 14, 29, 161, 60, 184, 95, 145, 143, 139, 55, 160, 127, 46, 121, 96, 26, 172, 222, 101, 91, 74, 21, 201, 8, 186, 11, 25, 252, 97, 235, 15, 176, 157, 154, 168, 169, 249, 230, 66, 248, 35, 222, 58, 39, 6, 21, 78, 77, 120, 166, 55, 194, 220, 44, 26, 196, 177, 114, 72, 214, 140, 205, 18, 147, 161, 85, 108, 152, 36, 83, 36, 219, 4, 152, 149, 21, 136, 204, 197, 237
        ];

        assert_eq(expected_event_body_ciphertext.len(), ciphertext.len());

        for i in 0..expected_event_body_ciphertext.len() {
            assert_eq(ciphertext[i], expected_event_body_ciphertext[i]);
        }
    }
}
