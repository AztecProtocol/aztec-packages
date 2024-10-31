use dep::protocol_types::{
    address::AztecAddress,
    constants::{GENERATOR_INDEX__SYMMETRIC_KEY, PRIVATE_LOG_SIZE_IN_BYTES},
    hash::poseidon2_hash_with_separator,
    point::Point,
    public_keys::OvpkM,
    scalar::Scalar,
};
use std::{
    aes128::aes128_encrypt, embedded_curve_ops::fixed_base_scalar_mul as derive_public_key,
    field::bn254::decompose, hash::from_field_unsafe as fr_to_fq_unsafe,
};

use crate::{
    encrypted_logs::header::EncryptedLogHeader,
    keys::point_to_symmetric_key::point_to_symmetric_key, oracle::random::random,
    utils::point::point_to_bytes,
};
use protocol_types::public_keys::AddressPoint;

pub comptime global PRIVATE_LOG_OVERHEAD_IN_BYTES: u32 = 304;

// 1 byte for storage slot, 1 byte for note type id, allowing 6 bytes for custom note fields.
global MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES: u32 = 8 * 32;

global MAX_PRIVATE_EVENT_LOG_PLAINTEXT_SIZE_IN_BYTES: u32 =
    MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES - 32; // Reserve 1 field for address tag.

// PRIVATE_LOG_SIZE_IN_BYTES
// - PRIVATE_LOG_OVERHEAD_IN_BYTES, consisting of:
//   - 32 bytes for incoming_tag
//   - 32 bytes for eph_pk
//   - 48 bytes for incoming_header
//   - 48 bytes for outgoing_header
//   - 144 bytes for outgoing_body
// - 16 + MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES for incoming_body, consisting of:
//   - 1 byte for plaintext length
//   - MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES for the actual plaintext and padded random values
//   - 15 bytes for AES padding

// Note: Update PRIVATE_LOG_SIZE_IN_BYTES in `constants.nr` if any of the above fields change.
// This value ideally should be set by the protocol, allowing users (or `aztec-nr`) to fit data within the defined size limits.
// Currently, we adjust this value as the structure changes, then update `constants.nr` to match.
// Once the structure is finalized with defined overhead and max note field sizes, this value will be fixed and should remain unaffected by further payload composition changes.

pub fn compute_private_log_payload<let P: u32>(
    contract_address: AztecAddress,
    ovsk_app: Field,
    ovpk: OvpkM,
    recipient: AztecAddress,
    sender: AztecAddress,
    plaintext: [u8; P],
) -> [u8; PRIVATE_LOG_SIZE_IN_BYTES] {
    let extended_plaintext: [u8; MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES + 1] =
        extend_private_log_plaintext(plaintext);
    compute_encrypted_log(
        contract_address,
        ovsk_app,
        ovpk,
        recipient,
        sender,
        extended_plaintext,
    )
}

pub fn compute_event_log_payload<let P: u32>(
    contract_address: AztecAddress,
    ovsk_app: Field,
    ovpk: OvpkM,
    recipient: AztecAddress,
    sender: AztecAddress,
    plaintext: [u8; P],
) -> [u8; PRIVATE_LOG_SIZE_IN_BYTES] {
    let extended_plaintext: [u8; MAX_PRIVATE_EVENT_LOG_PLAINTEXT_SIZE_IN_BYTES + 1] =
        extend_private_log_plaintext(plaintext);
    compute_encrypted_log(
        contract_address,
        ovsk_app,
        ovpk,
        recipient,
        sender,
        extended_plaintext,
    )
}

pub fn compute_partial_public_log_payload<let P: u32, let M: u32>(
    contract_address: AztecAddress,
    ovsk_app: Field,
    ovpk: OvpkM,
    recipient: AztecAddress,
    sender: AztecAddress,
    plaintext: [u8; P],
) -> [u8; M] {
    let extended_plaintext: [u8; P + 1] = extend_private_log_plaintext(plaintext);
    compute_encrypted_log(
        contract_address,
        ovsk_app,
        ovpk,
        recipient,
        sender,
        extended_plaintext,
    )
}

fn compute_encrypted_log<let P: u32, let M: u32>(
    contract_address: AztecAddress,
    ovsk_app: Field,
    ovpk: OvpkM,
    recipient: AztecAddress,
    sender: AztecAddress,
    plaintext: [u8; P],
) -> [u8; M] {
    let (eph_sk, eph_pk) = generate_ephemeral_key_pair();

    let header = EncryptedLogHeader::new(contract_address);

    let incoming_header_ciphertext: [u8; 48] =
        header.compute_ciphertext(eph_sk, recipient.to_address_point());
    let outgoing_header_ciphertext: [u8; 48] = header.compute_ciphertext(eph_sk, ovpk);
    let incoming_body_ciphertext =
        compute_incoming_body_ciphertext(plaintext, eph_sk, recipient.to_address_point());
    let outgoing_body_ciphertext: [u8; 144] =
        compute_outgoing_body_ciphertext(recipient, fr_to_fq(ovsk_app), eph_sk, eph_pk);

    let mut encrypted_bytes = [0; M];
    let mut offset = 0;

    // @todo We ignore the tags for now
    // incoming_tag
    offset += 32;

    // eph_pk
    let eph_pk_bytes = point_to_bytes(eph_pk);
    for i in 0..32 {
        encrypted_bytes[offset + i] = eph_pk_bytes[i];
    }
    offset += 32;

    // incoming_header
    // outgoing_header
    for i in 0..48 {
        encrypted_bytes[offset + i] = incoming_header_ciphertext[i];
        encrypted_bytes[offset + 48 + i] = outgoing_header_ciphertext[i];
    }
    offset += 48 * 2;

    // outgoing_body
    for i in 0..144 {
        encrypted_bytes[offset + i] = outgoing_body_ciphertext[i];
    }
    offset += 144;

    // incoming_body
    // Then we fill in the rest as the incoming body ciphertext
    let size = M - offset;
    assert_eq(size, incoming_body_ciphertext.len(), "ciphertext length mismatch");
    for i in 0..size {
        encrypted_bytes[offset + i] = incoming_body_ciphertext[i];
    }

    encrypted_bytes
}

// Prepend the plaintext length as the first byte, then copy the plaintext itself starting from the second byte.
// Fill the remaining bytes with random values to reach a fixed length of N.
fn extend_private_log_plaintext<let P: u32, let N: u32>(plaintext: [u8; P]) -> [u8; N] {
    let mut padded = unsafe { get_random_bytes() };
    padded[0] = P as u8;
    for i in 0..P {
        padded[i + 1] = plaintext[i];
    }
    padded
}

unconstrained fn get_random_bytes<let N: u32>() -> [u8; N] {
    let mut bytes = [0; N];
    let mut idx = 32;
    let mut randomness = [0; 32];
    for i in 0..N {
        if idx == 32 {
            randomness = random().to_be_bytes();
            idx = 1; // Skip the first byte as it's always 0.
        }
        bytes[i] = randomness[idx];
        idx += 1;
    }
    bytes
}

/// Converts a base field element to scalar field element.
/// This is fine because modulus of the base field is smaller than the modulus of the scalar field.
fn fr_to_fq(r: Field) -> Scalar {
    let (lo, hi) = decompose(r);

    Scalar { lo, hi }
}

fn generate_ephemeral_key_pair() -> (Scalar, Point) {
    // @todo Need to draw randomness from the full domain of Fq not only Fr
    // We use the randomness to preserve the privacy of both the sender and recipient via encryption, so a malicious
    // sender could use non-random values to reveal the plaintext. But they already know it themselves anyway, and so
    // the recipient already trusts them to not disclose this information. We can therefore assume that the sender will
    // cooperate in the random value generation.
    let randomness = unsafe { random() };

    // We use the unsafe version of `fr_to_fq` because multi_scalar_mul (called by derive_public_key) will constrain
    // the scalars.
    let eph_sk = fr_to_fq_unsafe(randomness);
    let eph_pk = derive_public_key(eph_sk);

    (eph_sk, eph_pk)
}

pub fn compute_incoming_body_ciphertext<let P: u32>(
    plaintext: [u8; P],
    eph_sk: Scalar,
    address_point: AddressPoint,
) -> [u8] {
    let full_key = point_to_symmetric_key(eph_sk, address_point.to_point());
    let mut sym_key = [0; 16];
    let mut iv = [0; 16];

    for i in 0..16 {
        sym_key[i] = full_key[i];
        iv[i] = full_key[i + 16];
    }
    aes128_encrypt(plaintext, iv, sym_key)
}

/// Encrypts ephemeral secret key and recipient's address point --> with this information the recipient of outgoing will
/// be able to derive the key with which the incoming log can be decrypted.
pub fn compute_outgoing_body_ciphertext(
    recipient: AztecAddress,
    ovsk_app: Scalar,
    eph_sk: Scalar,
    eph_pk: Point,
) -> [u8; 144] {
    // Again, we could compute `eph_pk` here, but we keep the interface more similar
    // and also make it easier to optimise it later as we just pass it along
    let mut buffer = [0 as u8; 128];

    let serialized_eph_sk_high: [u8; 32] = eph_sk.hi.to_be_bytes();
    let serialized_eph_sk_low: [u8; 32] = eph_sk.lo.to_be_bytes();

    let address_bytes: [u8; 32] = recipient.to_field().to_be_bytes();
    let serialized_recipient_address_point =
        point_to_bytes(recipient.to_address_point().to_point());

    for i in 0..32 {
        buffer[i] = serialized_eph_sk_high[i];
        buffer[i + 32] = serialized_eph_sk_low[i];
        buffer[i + 64] = address_bytes[i];
    }
    for i in 0..32 {
        buffer[i + 96] = serialized_recipient_address_point[i];
    }

    // We compute the symmetric key using poseidon.
    let full_key: [u8; 32] = poseidon2_hash_with_separator(
        [ovsk_app.hi, ovsk_app.lo, eph_pk.x, eph_pk.y],
        GENERATOR_INDEX__SYMMETRIC_KEY as Field,
    )
        .to_be_bytes();

    let mut sym_key = [0; 16];
    let mut iv = [0; 16];

    for i in 0..16 {
        sym_key[i] = full_key[i];
        iv[i] = full_key[i + 16];
    }
    aes128_encrypt(buffer, iv, sym_key).as_array()
}

mod test {
    use crate::encrypted_logs::payload::{
        compute_incoming_body_ciphertext, compute_outgoing_body_ciphertext,
        compute_private_log_payload, MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES,
    };
    use dep::protocol_types::{
        address::AztecAddress, point::Point, public_keys::OvpkM, scalar::Scalar,
    };
    use protocol_types::public_keys::AddressPoint;
    use std::embedded_curve_ops::fixed_base_scalar_mul as derive_public_key;
    use std::test::OracleMock;

    #[test]
    unconstrained fn test_encrypted_log_matches_typescript() {
        // All the values in this test were copied over from `encrypted_log_payload.test.ts`
        let contract_address = AztecAddress::from_field(
            0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04,
        );
        let ovsk_app = 0x191ac5e29bbc8f80f29ed06b75eaf30c036ed7952d844833860c527077c8c3b4;
        let ovpk_m = OvpkM {
            inner: Point {
                x: 0x07f696b8b233de2c1935e43c793399586f532da5ff7c0356636a75acb862e964,
                y: 0x156e8a3e42bfca3663936ba98c7fd26386a14657c23b5f5146f1a94b6c465154,
                is_infinite: false,
            },
        };

        let plaintext = [
            0, 0, 0, 1, 48, 22, 64, 206, 234, 117, 131, 145, 178, 225, 97, 201, 44, 5, 19, 241, 41,
            2, 15, 65, 37, 37, 106, 253, 174, 38, 70, 206, 49, 9, 159, 92, 16, 244, 140, 217, 239,
            247, 174, 91, 32, 156, 85, 124, 112, 222, 46, 101, 126, 231, 145, 102, 134, 134, 118,
            183, 135, 233, 65, 126, 25, 38, 14, 4, 15, 228, 107, 229, 131, 183, 31, 74, 181, 183,
            12, 38, 87, 255, 29, 5, 204, 207, 29, 41, 42, 147, 105, 98, 141, 26, 25, 79, 148, 78,
            101, 153, 0, 0, 16, 39,
        ];

        let randomness = 0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f;
        let _ = OracleMock::mock("getRandomField").returns(randomness).times(
            (MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES as u64 + 1 + 30) / 31,
        );

        let eph_sk = 0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538;
        let _ = OracleMock::mock("getRandomField").returns(eph_sk).times(1);

        let recipient = AztecAddress::from_field(
            0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c,
        );

        let sender = AztecAddress::from_field(
            0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c,
        );

        let log = compute_private_log_payload(
            contract_address,
            ovsk_app,
            ovpk_m,
            recipient,
            sender,
            plaintext,
        );

        // The following value was generated by `encrypted_log_payload.test.ts`
        // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
        let encrypted_log_from_typescript = [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 141, 70, 12, 14, 67, 77, 132, 110, 193, 234, 40, 110, 64, 144, 235, 86, 55,
            111, 242, 123, 221, 193, 170, 202, 225, 216, 86, 84, 159, 112, 31, 167, 5, 119, 121, 10,
            234, 188, 194, 216, 30, 200, 208, 201, 158, 127, 93, 43, 242, 241, 69, 32, 37, 220, 119,
            122, 23, 132, 4, 248, 81, 217, 61, 232, 24, 146, 63, 133, 24, 120, 113, 217, 155, 223,
            149, 214, 149, 239, 240, 169, 224, 155, 161, 81, 83, 252, 155, 77, 34, 75, 110, 30, 113,
            223, 189, 202, 171, 6, 192, 157, 91, 60, 116, 155, 254, 190, 28, 4, 7, 236, 205, 4, 245,
            27, 187, 89, 20, 38, 128, 200, 160, 145, 185, 127, 198, 203, 207, 97, 246, 194, 175,
            155, 142, 188, 143, 120, 83, 122, 178, 63, 208, 197, 232, 24, 228, 212, 45, 69, 157, 38,
            90, 219, 119, 194, 239, 130, 155, 246, 143, 135, 242, 196, 123, 71, 139, 181, 122, 231,
            228, 26, 7, 100, 63, 101, 195, 83, 8, 61, 85, 123, 148, 227, 29, 164, 162, 161, 49, 39,
            73, 141, 46, 179, 240, 52, 109, 165, 238, 210, 233, 188, 36, 90, 175, 2, 42, 149, 78,
            208, 176, 145, 50, 180, 152, 245, 55, 112, 40, 153, 180, 78, 54, 102, 119, 98, 56, 235,
            246, 51, 179, 86, 45, 127, 18, 77, 187, 168, 41, 24, 232, 113, 149, 138, 148, 33, 143,
            215, 150, 188, 105, 131, 254, 236, 199, 206, 56, 44, 130, 134, 29, 99, 254, 69, 153,
            146, 68, 234, 148, 148, 178, 38, 221, 182, 103, 252, 139, 7, 246, 132, 29, 232, 78, 102,
            126, 28, 136, 8, 219, 180, 162, 14, 62, 71, 118, 40, 147, 93, 87, 188, 231, 32, 93, 56,
            193, 194, 197, 120, 153, 164, 139, 114, 18, 149, 2, 226, 19, 170, 250, 249, 128, 56,
            236, 93, 14, 101, 115, 20, 173, 73, 192, 53, 229, 7, 23, 59, 11, 176, 9, 147, 175, 168,
            206, 48, 127, 126, 76, 51, 211, 66, 232, 16, 132, 243, 14, 196, 181, 118, 12, 71, 236,
            250, 253, 71, 249, 122, 30, 23, 23, 19, 89, 47, 193, 69, 240, 164, 34, 128, 110, 13,
            133, 198, 7, 165, 14, 31, 239, 210, 146, 78, 67, 86, 32, 159, 244, 214, 246, 121, 246,
            233, 252, 20, 131, 221, 28, 146, 222, 119, 222, 162, 250, 252, 189, 18, 147, 12, 142,
            177, 222, 178, 122, 248, 113, 197, 40, 199, 152, 251, 91, 81, 243, 25, 156, 241, 141,
            60, 12, 99, 103, 169, 97, 32, 112, 37, 244, 255, 126, 46, 114, 226, 113, 223, 249, 27,
            3, 31, 41, 233, 28, 8, 23, 84, 99, 25, 186, 65, 33, 9, 35, 74, 16, 52, 169, 48, 161,
            134, 233, 242, 136, 39, 162, 105, 205, 43, 253, 183, 36, 138, 186, 87, 31, 7, 248, 125,
            227, 193, 172, 155, 98, 33, 61, 186, 158, 241, 192, 23, 28, 186, 100, 222, 174, 19, 64,
            224, 113, 251, 143, 45, 152, 81, 67, 116, 16, 95, 189, 83, 31, 124, 39, 155, 142, 66, 0,
            120, 197, 221, 161, 62, 75, 192, 255, 186, 200, 10, 135, 7,
        ];
        assert_eq(encrypted_log_from_typescript, log);
    }

    #[test]
    fn test_incoming_body_ciphertext_matches_typescript() {
        // All the values in this test were copied over from `encrypted_note_log_incoming_body.test.ts`
        let eph_sk = Scalar {
            lo: 0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd,
            hi: 0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06,
        };
        let address_point = AddressPoint {
            inner: Point {
                x: 0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
                y: 0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e,
                is_infinite: false,
            },
        };
        let plaintext = [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3,
        ];

        // `compute_incoming_body_ciphertext(...)` function then derives symmetric key from `eph_sk` and `address_point` and encrypts
        // the note plaintext using AES-128.
        let ciphertext = compute_incoming_body_ciphertext(plaintext, eph_sk, address_point);

        // The following value was generated by `encrypted_note_log_incoming_body.test.ts`.
        // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
        let note_body_ciphertext_from_typescript = [
            226, 240, 253, 6, 28, 52, 19, 131, 33, 132, 178, 212, 245, 62, 14, 190, 147, 228, 160,
            190, 146, 61, 95, 203, 124, 153, 68, 168, 17, 150, 92, 0, 99, 214, 85, 64, 191, 78, 157,
            131, 149, 96, 236, 253, 96, 172, 157, 30, 27, 176, 228, 74, 242, 190, 138, 48, 33, 93,
            46, 37, 223, 130, 25, 245, 188, 163, 159, 223, 187, 24, 139, 206, 131, 154, 159, 130,
            37, 17, 158, 114, 242, 141, 124, 193, 232, 54, 146, 96, 145, 100, 125, 234, 57, 43, 95,
            115, 183, 39, 121, 232, 134, 229, 148, 25, 46, 77, 87, 127, 95, 7, 77, 188, 37, 234,
            245, 142, 232, 87, 252, 28, 67, 67, 90, 214, 254, 89, 47, 68, 66, 187, 227, 8, 59, 162,
            25, 141, 97, 141, 217, 197, 115, 15, 212, 202, 157, 41, 150, 62, 219, 57, 224, 92, 185,
            212, 142, 94, 146, 41, 178, 145, 68, 169, 23, 185, 206, 138, 70, 47, 176, 210, 165, 236,
            23, 206, 229, 108,
        ];

        assert_eq(note_body_ciphertext_from_typescript.len(), ciphertext.len());

        for i in 0..note_body_ciphertext_from_typescript.len() {
            assert_eq(ciphertext[i], note_body_ciphertext_from_typescript[i]);
        }
    }

    #[test]
    fn test_encrypted_log_outgoing_body_matches_typescript() {
        let eph_sk = Scalar {
            lo: 0x00000000000000000000000000000000d0d302ee245dfaf2807e604eec4715fe,
            hi: 0x000000000000000000000000000000000f096b423017226a18461115fa8d34bb,
        };

        let sender_ovsk_app = Scalar {
            lo: 0x0000000000000000000000000000000074d2e28c6bc5176ac02cf7c7d36a444e,
            hi: 0x00000000000000000000000000000000089c6887cb1446d86c64e81afc78048b,
        };

        let eph_pk = derive_public_key(eph_sk);
        let recipient = AztecAddress::from_field(
            0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c,
        );

        let ciphertext =
            compute_outgoing_body_ciphertext(recipient, sender_ovsk_app, eph_sk, eph_pk);

        // The following value was generated by `encrypted_log_payload.test.ts`
        // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
        let outgoing_body_ciphertext_from_typescript = [
            127, 182, 227, 75, 192, 197, 54, 47, 168, 134, 233, 148, 251, 46, 86, 12, 73, 50, 238,
            50, 31, 174, 27, 202, 110, 77, 161, 197, 244, 124, 17, 100, 143, 150, 232, 14, 156, 248,
            43, 177, 16, 82, 244, 103, 88, 74, 84, 200, 15, 65, 187, 14, 163, 60, 91, 22, 104, 31,
            211, 190, 124, 121, 79, 92, 238, 182, 194, 225, 34, 71, 67, 116, 27, 231, 68, 161, 147,
            94, 53, 195, 83, 237, 172, 52, 173, 229, 26, 234, 107, 43, 82, 68, 16, 105, 37, 125,
            117, 86, 133, 50, 21, 92, 74, 229, 105, 141, 83, 229, 255, 251, 21, 61, 234, 61, 168,
            221, 106, 231, 8, 73, 208, 60, 251, 46, 251, 228, 148, 144, 187, 195, 38, 18, 223, 153,
            8, 121, 178, 84, 237, 148, 254, 219, 59, 62,
        ];

        assert_eq(outgoing_body_ciphertext_from_typescript, ciphertext);
    }
}
