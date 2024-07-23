use dep::protocol_types::{
    address::AztecAddress, scalar::Scalar, point::Point,
    constants::{GENERATOR_INDEX__IVSK_M, GENERATOR_INDEX__OVSK_M}, hash::poseidon2_hash
};
use std::embedded_curve_ops::fixed_base_scalar_mul as derive_public_key;
use std::field::bytes32_to_field;

use crate::oracle::unsafe_rand::unsafe_rand;
use crate::utils::point::point_to_bytes;

use crate::event::event_interface::EventInterface;
use crate::note::note_interface::NoteInterface;

use crate::encrypted_logs::{
    header::EncryptedLogHeader, incoming_body::EncryptedLogIncomingBody,
    outgoing_body::EncryptedLogOutgoingBody
};

pub fn compute_encrypted_event_log<Event, let NB: u32, let MB: u32, let OB: u32>(
    contract_address: AztecAddress,
    randomness: Field,
    ovsk_app: Field,
    ovpk: Point,
    ivpk: Point,
    recipient: AztecAddress,
    event: Event
) -> [u8; OB] where Event: EventInterface<NB, MB> {
    // @todo Need to draw randomness from the full domain of Fq not only Fr
    let eph_sk: Scalar = fr_to_fq(unsafe_rand());
    let eph_pk = derive_public_key(eph_sk);

    let header = EncryptedLogHeader::new(contract_address);

    let incoming_header_ciphertext: [u8; 48] = header.compute_ciphertext(eph_sk, ivpk);
    let outgoing_header_ciphertext: [u8; 48] = header.compute_ciphertext(eph_sk, ovpk);
    let incoming_body_ciphertext = EncryptedLogIncomingBody::from_event(event, randomness).compute_ciphertext(eph_sk, ivpk);
    let outgoing_body_ciphertext: [u8; 144] = EncryptedLogOutgoingBody::new(eph_sk, recipient, ivpk).compute_ciphertext(fr_to_fq(ovsk_app), eph_pk);

    let mut encrypted_bytes: [u8; OB] = [0; OB];
    // @todo We ignore the tags for now 

    let eph_pk_bytes = point_to_bytes(eph_pk);
    for i in 0..32 {
        encrypted_bytes[64 + i] = eph_pk_bytes[i];
    }
    for i in 0..48 {
        encrypted_bytes[96 + i] = incoming_header_ciphertext[i];
        encrypted_bytes[144 + i] = outgoing_header_ciphertext[i];
    }
    for i in 0..144 {
        encrypted_bytes[192 + i] = outgoing_body_ciphertext[i];
    }
    // Then we fill in the rest as the incoming body ciphertext
    let size = OB - 336;
    assert_eq(size, incoming_body_ciphertext.len(), "ciphertext length mismatch");
    for i in 0..size {
        encrypted_bytes[336 + i] = incoming_body_ciphertext[i];
    }

    // Current unoptimized size of the encrypted log
    // incoming_tag (32 bytes)
    // outgoing_tag (32 bytes)
    // eph_pk (32 bytes)
    // incoming_header (48 bytes)
    // outgoing_header (48 bytes)
    // outgoing_body (144 bytes)
    // incoming_body_fixed (64 bytes)
    // incoming_body_variable (N * 32 bytes + 16 bytes padding)
    encrypted_bytes
}

pub fn compute_encrypted_note_log<Note, let N: u32, let NB: u32, let M: u32>(
    contract_address: AztecAddress,
    storage_slot: Point,
    ovsk_app: Field,
    ovpk: Point,
    ivpk: Point,
    recipient: AztecAddress,
    note: Note
) -> [u8; M] where Note: NoteInterface<N, NB> {
    // @todo Need to draw randomness from the full domain of Fq not only Fr
    let eph_sk: Scalar = fr_to_fq(unsafe_rand());
    let eph_pk = derive_public_key(eph_sk);

    let header = EncryptedLogHeader::new(contract_address);

    let incoming_header_ciphertext: [u8; 48] = header.compute_ciphertext(eph_sk, ivpk);
    let outgoing_header_ciphertext: [u8; 48] = header.compute_ciphertext(eph_sk, ovpk);
    let incoming_body_ciphertext = EncryptedLogIncomingBody::from_note(note, storage_slot).compute_ciphertext(eph_sk, ivpk);
    let outgoing_body_ciphertext: [u8; 144] = EncryptedLogOutgoingBody::new(eph_sk, recipient, ivpk).compute_ciphertext(fr_to_fq(ovsk_app), eph_pk);

    let mut encrypted_bytes: [u8; M] = [0; M];
    // @todo We ignore the tags for now 

    let eph_pk_bytes = point_to_bytes(eph_pk);
    for i in 0..32 {
        encrypted_bytes[64 + i] = eph_pk_bytes[i];
    }
    for i in 0..48 {
        encrypted_bytes[96 + i] = incoming_header_ciphertext[i];
        encrypted_bytes[144 + i] = outgoing_header_ciphertext[i];
    }
    for i in 0..144 {
        encrypted_bytes[192 + i] = outgoing_body_ciphertext[i];
    }
    // Then we fill in the rest as the incoming body ciphertext
    let size = M - 336;
    assert_eq(size, incoming_body_ciphertext.len(), "ciphertext length mismatch");
    for i in 0..size {
        encrypted_bytes[336 + i] = incoming_body_ciphertext[i];
    }

    // Current unoptimized size of the encrypted log
    // incoming_tag (32 bytes)
    // outgoing_tag (32 bytes)
    // eph_pk (32 bytes)
    // incoming_header (48 bytes)
    // outgoing_header (48 bytes)
    // outgoing_body (144 bytes)
    // incoming_body_fixed (64 bytes)
    // incoming_body_variable (N * 32 bytes + 16 bytes padding)
    encrypted_bytes
}

/// Converts a base field elememt to scalar field element.
/// This is fine because modulus of the base field is smaller than the modulus of the scalar field.
fn fr_to_fq(r: Field) -> Scalar {
    let r_bytes = r.to_be_bytes(32);

    let mut high_bytes = [0; 32];
    let mut low_bytes = [0; 32];

    for i in 0..16 {
        high_bytes[16 + i] = r_bytes[i];
        low_bytes[16 + i] = r_bytes[i + 16];
    }

    let lo = bytes32_to_field(low_bytes);
    let hi = bytes32_to_field(high_bytes);

    Scalar { lo, hi }
}

mod test {
    use crate::{encrypted_logs::payload::compute_encrypted_note_log, test::mocks::mock_note::MockNoteBuilder};
    use dep::protocol_types::{address::AztecAddress, point::Point};
    use std::test::OracleMock;

    #[test]
    fn test_encrypted_note_log_matches_typescript() {
        // All the values in this test were copied over from `tagged_log.test.ts`
        let contract_address = AztecAddress::from_field(0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04);
        let storage_slot = Point {
            x: 0x1d83b1af3f569775af9e3fdae19b84590245098f46d4a407b5963f313000ce37,
            y: 0x1537c632779932ccbc415d91dd70801f88ad410fff48179886d3dce035582d76,
            is_infinite: false
        };
        let ovsk_app = 0x1b99ba138fa7ef8a2f122a98dd80c8ee70d447218dd780f45e165ac17ca38a5e;
        let ovpk_m = Point {
            x: 0x1961448682803198631f299340e4206bb12809d4bebbf012b30f59af73ba1a15,
            y: 0x133674060c3925142aceb4f1dcd9f9137d0217d37ff8729ee5ceaa6e2790353d,
            is_infinite: false
        };
        let ivpk_m = Point {
            x: 0x260cd3904f6df16e974c29944fdc839e40fb5cf293f03df2eb370851d3a527bc,
            y: 0x0eef2964fe6640e84c82b5d2915892409b38e9e25d39f68dd79edb725c55387f,
            is_infinite: false
        };

        let note_value = 0x301640ceea758391b2e161c92c0513f129020f4125256afdae2646ce31099f5c;
        let note = MockNoteBuilder::new(note_value).contract_address(contract_address).storage_slot(storage_slot).build();

        let eph_sk = 0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538;
        let _ = OracleMock::mock("getRandomField").returns(eph_sk);

        let recipient = AztecAddress::from_field(0x10ee41ee4b62703b16f61e03cb0d88c4b306a9eb4a6ceeb2aff13428541689a2);

        let log: [u8; 448] = compute_encrypted_note_log(
            contract_address,
            storage_slot,
            ovsk_app,
            ovpk_m,
            ivpk_m,
            recipient,
            note
        );

        // For how the following value is formed see line 113 of this file
        let encrypted_note_log_from_typescript = [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 141, 70, 12, 14, 67, 77, 132, 110, 193, 234, 40, 110, 64, 144, 235, 86, 55, 111, 242, 123, 221, 193, 170, 202, 225, 216, 86, 84, 159, 112, 31, 167, 126, 79, 51, 186, 47, 71, 253, 172, 99, 112, 241, 59, 197, 241, 107, 186, 232, 87, 187, 230, 171, 62, 228, 234, 42, 51, 145, 146, 238, 242, 42, 71, 206, 13, 244, 66, 111, 195, 20, 203, 98, 148, 204, 242, 145, 183, 156, 29, 141, 54, 44, 220, 194, 35, 229, 16, 32, 204, 211, 49, 142, 112, 82, 202, 116, 241, 254, 146, 42, 217, 20, 189, 70, 228, 182, 171, 205, 104, 27, 99, 171, 28, 91, 244, 21, 30, 130, 240, 5, 72, 174, 124, 97, 197, 157, 248, 204, 203, 140, 171, 181, 152, 130, 169, 179, 41, 52, 173, 45, 43, 198, 1, 152, 72, 158, 249, 11, 41, 9, 160, 48, 78, 123, 132, 203, 140, 215, 13, 22, 201, 88, 255, 139, 154, 76, 20, 63, 134, 125, 108, 239, 208, 63, 59, 33, 117, 139, 225, 184, 0, 64, 153, 21, 131, 204, 111, 41, 84, 23, 144, 222, 245, 200, 12, 234, 11, 48, 10, 221, 20, 252, 38, 122, 40, 249, 66, 248, 197, 198, 209, 79, 20, 59, 66, 197, 215, 16, 18, 145, 228, 239, 124, 81, 67, 103, 49, 196, 58, 228, 195, 64, 199, 243, 184, 112, 173, 29, 196, 215, 77, 217, 85, 82, 149, 113, 76, 201, 93, 95, 148, 37, 95, 222, 233, 210, 150, 1, 182, 28, 132, 59, 148, 156, 129, 36, 230, 55, 199, 149, 36, 88, 50, 143, 204, 153, 32, 104, 29, 137, 19, 31, 178, 137, 117, 157, 20, 8, 128, 230, 250, 75, 44, 54, 128, 2, 241, 208, 153, 7, 214, 252, 57, 152, 75, 69, 57, 248, 179, 156, 145, 92, 165, 13, 116, 53, 33, 42, 183, 231, 77, 203, 170, 125, 20, 121, 48, 136, 194, 94, 139, 207, 148, 218, 248, 129, 231, 129, 191, 45, 239, 108, 60, 34, 82, 117, 186, 180, 199, 77, 169, 213, 238, 47, 37, 0, 40, 12, 110, 216, 175, 23, 59, 81, 117, 164, 24, 80, 241, 40, 126, 179, 230, 78, 145, 75, 102, 204, 12, 30, 146, 240, 222
        ];
        for i in 0..encrypted_note_log_from_typescript.len() {
            assert_eq(log[i], encrypted_note_log_from_typescript[i]);
        }
        assert_eq(encrypted_note_log_from_typescript.len(), log.len());
    }
}
