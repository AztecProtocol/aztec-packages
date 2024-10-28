use dep::protocol_types::{
    address::AztecAddress,
    constants::GENERATOR_INDEX__SYMMETRIC_KEY,
    hash::poseidon2_hash_with_separator,
    point::Point,
    public_keys::{IvpkM, OvpkM},
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

fn compute_private_log_payload<let P: u32, let M: u32>(
    contract_address: AztecAddress,
    ovsk_app: Field,
    ovpk: OvpkM,
    recipient: AztecAddress,
    plaintext: [u8; P],
    include_public_values_prefix: bool,
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

    // If we include the prefix for number of public values, we need to add 1 byte to the offset
    let mut offset = if include_public_values_prefix { 1 } else { 0 };

    let mut encrypted_bytes: [u8; M] = [0; M];
    // @todo We ignore the tags for now
    offset += 64;

    let eph_pk_bytes = point_to_bytes(eph_pk);
    for i in 0..32 {
        encrypted_bytes[offset + i] = eph_pk_bytes[i];
    }

    offset += 32;
    for i in 0..48 {
        encrypted_bytes[offset + i] = incoming_header_ciphertext[i];
        encrypted_bytes[offset + 48 + i] = outgoing_header_ciphertext[i];
    }

    offset += 48 * 2;
    for i in 0..144 {
        encrypted_bytes[offset + i] = outgoing_body_ciphertext[i];
    }

    offset += 144;
    // Then we fill in the rest as the incoming body ciphertext
    let size = M - offset;
    assert_eq(size, incoming_body_ciphertext.len(), "ciphertext length mismatch");
    for i in 0..size {
        encrypted_bytes[offset + i] = incoming_body_ciphertext[i];
    }

    // Current unoptimized size of the encrypted log
    // empty_prefix (1 byte)
    // incoming_tag (32 bytes)
    // outgoing_tag (32 bytes)
    // eph_pk (32 bytes)
    // incoming_header (48 bytes)
    // outgoing_header (48 bytes)
    // outgoing_body (144 bytes)
    // incoming_body_fixed (64 bytes)
    // incoming_body_variable (P + 16 bytes padding)
    encrypted_bytes
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

/// Encrypts ephemeral secret key and recipient's ivpk --> with this information the recipient of outgoing will
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
    let serialized_recipient_ivpk = point_to_bytes(recipient.to_address_point().to_point());

    for i in 0..32 {
        buffer[i] = serialized_eph_sk_high[i];
        buffer[i + 32] = serialized_eph_sk_low[i];
        buffer[i + 64] = address_bytes[i];
    }
    for i in 0..32 {
        buffer[i + 96] = serialized_recipient_ivpk[i];
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
        compute_private_log_payload,
    };
    use dep::protocol_types::{
        address::AztecAddress,
        point::Point,
        public_keys::{IvpkM, OvpkM},
        scalar::Scalar,
    };
    use protocol_types::public_keys::AddressPoint;
    use std::embedded_curve_ops::fixed_base_scalar_mul as derive_public_key;
    use std::test::OracleMock;

    #[test]
    unconstrained fn test_encrypted_log_matches_typescript() {
        // All the values in this test were copied over from `tagged_log.test.ts`
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

        let ivpk_m = IvpkM {
            inner: Point {
                x: 0x18dd22d6a4032eefe3a7a55703f583396596235f7c186e450c92981186ee7404,
                y: 0x2e49e00996565114016a1a478309842ecbaf930fb716c3f498e7e10370631d75,
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

        let eph_sk = 0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538;
        let _ = OracleMock::mock("getRandomField").returns(eph_sk);

        let recipient = AztecAddress::from_field(
            0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c,
        );

        let log: [u8; 448] = compute_private_log_payload(
            contract_address,
            ovsk_app,
            ovpk_m,
            recipient,
            plaintext,
            false,
        );

        // The following value was generated by `encrypted_log_payload.test.ts`
        // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
        let encrypted_log_from_typescript = [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 141, 70, 12, 14, 67, 77, 132, 110, 193, 234, 40, 110, 64, 144, 235,
            86, 55, 111, 242, 123, 221, 193, 170, 202, 225, 216, 86, 84, 159, 112, 31, 167, 5, 119,
            121, 10, 234, 188, 194, 216, 30, 200, 208, 201, 158, 127, 93, 43, 242, 241, 69, 32, 37,
            220, 119, 122, 23, 132, 4, 248, 81, 217, 61, 232, 24, 146, 63, 133, 24, 120, 113, 217,
            155, 223, 149, 214, 149, 239, 240, 169, 224, 155, 161, 81, 83, 252, 155, 77, 34, 75,
            110, 30, 113, 223, 189, 202, 171, 6, 192, 157, 91, 60, 116, 155, 254, 190, 28, 4, 7,
            236, 205, 4, 245, 27, 187, 89, 20, 38, 128, 200, 160, 145, 185, 127, 198, 203, 207, 97,
            246, 194, 175, 155, 142, 188, 143, 120, 83, 122, 178, 63, 208, 197, 232, 24, 228, 212,
            45, 69, 157, 38, 90, 219, 119, 194, 239, 130, 155, 246, 143, 135, 242, 196, 123, 71,
            139, 181, 122, 231, 228, 26, 7, 100, 63, 101, 195, 83, 8, 61, 85, 123, 148, 227, 29,
            164, 162, 161, 49, 39, 73, 141, 46, 179, 240, 52, 109, 165, 238, 210, 233, 188, 36, 90,
            175, 2, 42, 149, 78, 208, 176, 145, 50, 180, 152, 245, 55, 112, 40, 153, 180, 78, 54,
            102, 119, 98, 56, 235, 246, 51, 179, 86, 45, 127, 18, 77, 187, 168, 41, 24, 232, 113,
            149, 138, 148, 33, 143, 215, 150, 188, 105, 131, 254, 236, 199, 206, 56, 44, 130, 134,
            29, 99, 254, 69, 153, 146, 68, 234, 148, 148, 178, 38, 221, 182, 148, 178, 100, 13, 206,
            0, 91, 71, 58, 207, 26, 227, 190, 21, 143, 85, 138, 209, 202, 34, 142, 159, 121, 61, 9,
            57, 2, 48, 162, 89, 126, 14, 83, 173, 40, 247, 170, 154, 112, 12, 204, 48, 38, 7, 173,
            108, 38, 234, 20, 16, 115, 91, 106, 140, 121, 63, 99, 23, 247, 0, 148, 9, 163, 145, 43,
            21, 238, 47, 40, 204, 241, 124, 246, 201, 75, 114, 3, 1, 229, 197, 130, 109, 227, 158,
            133, 188, 125, 179, 220, 51, 170, 121, 175, 202, 243, 37, 103, 13, 27, 53, 157, 8, 177,
            11, 208, 120, 64, 211, 148, 201, 240, 56,
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

        // `compute_incoming_body_ciphertext(...)` function then derives symmetric key from `eph_sk` and `ivpk` and encrypts
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
