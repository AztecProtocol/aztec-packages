use dep::protocol_types::{
    address::AztecAddress,
    constants::{GENERATOR_INDEX__SYMMETRIC_KEY, MAX_PRIVATE_LOG_SIZE_IN_BYTES},
    hash::poseidon2_hash_with_separator,
    point::Point,
    public_keys::{AddressPoint, OvpkM},
    scalar::Scalar,
};
use std::{
    aes128::aes128_encrypt, embedded_curve_ops::fixed_base_scalar_mul as derive_public_key,
    field::bn254::decompose, hash::from_field_unsafe as fr_to_fq_unsafe,
};

use crate::{
    encrypted_logs::header::EncryptedLogHeader,
    keys::point_to_symmetric_key::point_to_symmetric_key,
    oracle::{
        notes::{get_app_tag_bytes_as_sender, increment_app_tagging_secret_index_as_sender},
        random::random,
    },
    utils::point::point_to_bytes,
};

comptime global HEADER_SIZE: u32 = 48;

comptime global OUTGOING_BODY_SIZE: u32 = 112;

// Bytes padded to the overhead, so that the size of the incoming body ciphertext will be a multiple of 16.
comptime global OVERHEAD_PADDING: u32 = 14;

pub comptime global PRIVATE_LOG_OVERHEAD_IN_BYTES: u32 = 32 /* incoming_tag */
    + 32 /* eph_pk */
    + HEADER_SIZE /* incoming_header */
    + HEADER_SIZE /* outgoing_header */
    + OUTGOING_BODY_SIZE /* outgoing_body */
    + OVERHEAD_PADDING /* padding */;

global PLAINTEXT_SIZE_LENGTH = 2;

// 1 byte for storage slot, 1 byte for note type id, allowing 6 bytes for custom note fields.
global MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES: u32 = MAX_PRIVATE_LOG_SIZE_IN_BYTES
    - PRIVATE_LOG_OVERHEAD_IN_BYTES
    - PLAINTEXT_SIZE_LENGTH
    - 1 /* aes padding */;

global MAX_PRIVATE_EVENT_LOG_PLAINTEXT_SIZE_IN_BYTES: u32 =
    MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES - 32; // Reserve 1 field for address tag.

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
) -> [u8; MAX_PRIVATE_LOG_SIZE_IN_BYTES] {
    assert(
        P < MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES,
        f"plaintext for log must not exceed {MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES}",
    );
    let extended_plaintext: [u8; MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES + PLAINTEXT_SIZE_LENGTH] =
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
) -> [u8; MAX_PRIVATE_LOG_SIZE_IN_BYTES - 32] {
    assert(
        P < MAX_PRIVATE_EVENT_LOG_PLAINTEXT_SIZE_IN_BYTES,
        f"plaintext for event log must not exceed {MAX_PRIVATE_EVENT_LOG_PLAINTEXT_SIZE_IN_BYTES}",
    );
    let extended_plaintext: [u8; MAX_PRIVATE_EVENT_LOG_PLAINTEXT_SIZE_IN_BYTES + PLAINTEXT_SIZE_LENGTH] =
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
    let extended_plaintext: [u8; P + PLAINTEXT_SIZE_LENGTH] =
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
    let outgoing_body_ciphertext: [u8; 112] =
        compute_outgoing_body_ciphertext(recipient, fr_to_fq(ovsk_app), eph_sk, eph_pk);

    let mut encrypted_bytes = [0; M];
    let mut offset = 0;

    // We assume that the sender wants for the recipient to find the tagged note, and therefore that they will cooperate
    // and use the correct tag. Usage of a bad tag will result in the recipient not being able to find the note
    // automatically.
    let tag_bytes = unsafe { get_app_tag_bytes_as_sender(sender, recipient) };
    increment_app_tagging_secret_index_as_sender(sender, recipient);

    for i in 0..32 {
        encrypted_bytes[offset + i] = tag_bytes[i];
    }
    offset += 32;

    // eph_pk
    let eph_pk_bytes = point_to_bytes(eph_pk);
    for i in 0..32 {
        encrypted_bytes[offset + i] = eph_pk_bytes[i];
    }
    offset += 32;

    // incoming_header
    // outgoing_header
    for i in 0..HEADER_SIZE {
        encrypted_bytes[offset + i] = incoming_header_ciphertext[i];
        encrypted_bytes[offset + 48 + i] = outgoing_header_ciphertext[i];
    }
    offset += HEADER_SIZE * 2;

    // outgoing_body
    for i in 0..OUTGOING_BODY_SIZE {
        encrypted_bytes[offset + i] = outgoing_body_ciphertext[i];
    }
    offset += OUTGOING_BODY_SIZE;

    // Padding.
    offset += OVERHEAD_PADDING;

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
    padded[0] = (P >> 8) as u8;
    padded[1] = P as u8;
    for i in 0..P {
        padded[i + PLAINTEXT_SIZE_LENGTH] = plaintext[i];
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
) -> [u8; OUTGOING_BODY_SIZE] {
    // Again, we could compute `eph_pk` here, but we keep the interface more similar
    // and also make it easier to optimise it later as we just pass it along
    let mut buffer = [0 as u8; 96];

    let serialized_eph_sk_high: [u8; 32] = eph_sk.hi.to_be_bytes();
    let serialized_eph_sk_low: [u8; 32] = eph_sk.lo.to_be_bytes();

    let address_bytes: [u8; 32] = recipient.to_field().to_be_bytes();
    let serialized_recipient_address_point =
        point_to_bytes(recipient.to_address_point().to_point());

    for i in 0..16 {
        buffer[i] = serialized_eph_sk_high[i + 16];
        buffer[i + 16] = serialized_eph_sk_low[i + 16];
    }
    for i in 0..32 {
        buffer[i + 32] = address_bytes[i];
        buffer[i + 64] = serialized_recipient_address_point[i];
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

        let randomness = 0x0101010101010101010101010101010101010101010101010101010101010101;
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

        let _ = OracleMock::mock("getAppTaggingSecretAsSender").returns([69420, 1337]);

        let _ = OracleMock::mock("incrementAppTaggingSecretIndexAsSender").returns(());

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
            14, 156, 255, 195, 221, 215, 70, 175, 251, 2, 65, 13, 143, 10, 130, 62, 137, 147, 151,
            133, 188, 200, 232, 142, 228, 243, 202, 224, 94, 115, 124, 54, 141, 70, 12, 14, 67, 77,
            132, 110, 193, 234, 40, 110, 64, 144, 235, 86, 55, 111, 242, 123, 221, 193, 170, 202,
            225, 216, 86, 84, 159, 112, 31, 167, 5, 119, 121, 10, 234, 188, 194, 216, 30, 200, 208,
            201, 158, 127, 93, 43, 242, 241, 69, 32, 37, 220, 119, 122, 23, 132, 4, 248, 81, 217,
            61, 232, 24, 146, 63, 133, 24, 120, 113, 217, 155, 223, 149, 214, 149, 239, 240, 169,
            224, 155, 161, 81, 83, 252, 155, 77, 34, 75, 110, 30, 113, 223, 189, 202, 171, 6, 192,
            157, 91, 60, 116, 155, 254, 190, 28, 4, 7, 236, 205, 4, 245, 27, 187, 89, 20, 38, 128,
            200, 160, 145, 185, 127, 198, 203, 207, 97, 93, 239, 89, 58, 176, 158, 91, 63, 127, 88,
            246, 252, 35, 92, 144, 231, 199, 126, 216, 218, 219, 59, 5, 238, 69, 69, 167, 188, 97,
            44, 145, 57, 71, 95, 238, 96, 112, 190, 71, 239, 204, 67, 165, 203, 188, 135, 54, 50,
            241, 66, 143, 172, 149, 45, 249, 193, 129, 219, 95, 158, 133, 11, 33, 254, 17, 254, 222,
            243, 123, 136, 202, 238, 149, 17, 27, 206, 119, 110, 72, 141, 242, 25, 115, 45, 10, 119,
            209, 146, 1, 112, 71, 24, 111, 65, 68, 94, 205, 92, 96, 52, 135, 247, 251, 60, 143, 49,
            1, 10, 34, 175, 105, 206, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 166, 0, 166, 31,
            125, 89, 238, 175, 82, 235, 81, 188, 5, 146, 255, 152, 29, 155, 163, 234, 142, 110, 168,
            186, 157, 192, 206, 200, 199, 11, 129, 232, 69, 86, 167, 124, 230, 195, 202, 71, 165,
            39, 249, 159, 254, 123, 37, 36, 187, 136, 90, 35, 2, 11, 114, 149, 116, 138, 209, 156,
            16, 131, 97, 138, 217, 98, 152, 183, 110, 224, 126, 177, 165, 109, 25, 204, 121, 135,
            16, 233, 245, 222, 150, 80, 27, 213, 155, 55, 129, 201, 192, 42, 108, 149, 197, 145, 47,
            137, 54, 177, 80, 13, 54, 42, 251, 240, 146, 44, 133, 177, 173, 161, 141, 184, 185, 81,
            98, 166, 233, 208, 103, 101, 92, 223, 102, 158, 179, 135, 248, 224, 73, 42, 149, 253,
            205, 179, 148, 41, 213, 52, 11, 75, 235, 194, 80, 186, 155, 246, 44, 47, 73, 245, 73,
            243, 123, 238, 215, 90, 102, 138, 165, 25, 103, 224, 229, 117, 71, 229, 166, 85, 21,
            123, 207, 56, 30, 34, 243, 14, 37, 136, 21, 72, 236, 150, 6, 161, 81, 181, 251, 251, 45,
            20, 238, 75, 52, 191, 76, 29, 189, 113, 199, 190, 21, 173, 76, 99, 71, 75, 182, 248,
            153, 112, 174, 179, 217, 72, 156, 142, 219, 223, 248, 10, 26, 58, 92, 40, 55, 14, 83,
            74, 188, 135, 10, 133, 234, 67, 24, 50, 110, 161, 146, 34, 251, 16, 223, 53, 140, 118,
            94, 218, 218, 73, 125, 180, 40, 74, 227, 5, 7, 162, 224, 62, 152, 61, 35, 207, 160, 189,
            131, 21, 119, 232,
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
            97, 221, 53, 168, 242, 56, 217, 184, 114, 127, 137, 98, 31, 63, 86, 179, 139, 198, 162,
            162, 216, 158, 255, 205, 90, 212, 141, 55, 9, 245, 6, 146, 202, 137, 129, 36, 190, 31,
            17, 89, 151, 203, 43, 196, 203, 233, 178, 79, 202, 70, 250, 182, 18, 191, 79, 42, 205,
            204, 145, 14, 13, 35, 255, 139, 142, 66, 193, 240, 175, 233, 180, 37, 153, 235, 41, 88,
            232, 52, 235, 213, 50, 26, 153, 227, 25, 242, 161, 92, 45, 152, 100, 106, 29, 192, 131,
            101, 121, 126, 31, 118, 191, 90, 238, 43, 24, 82, 49, 18, 199, 107, 83, 7,
        ];

        assert_eq(outgoing_body_ciphertext_from_typescript, ciphertext);
    }
}
