use dep::protocol_types::{
    address::AztecAddress, scalar::Scalar, point::Point, public_keys::{OvpkM, IvpkM},
    constants::GENERATOR_INDEX__SYMMETRIC_KEY, hash::poseidon2_hash_with_separator
};
use std::{
    aes128::aes128_encrypt, embedded_curve_ops::fixed_base_scalar_mul as derive_public_key,
    hash::from_field_unsafe as fr_to_fq_unsafe, field::bn254::decompose
};

use crate::{
    oracle::random::random, utils::point::point_to_bytes, encrypted_logs::header::EncryptedLogHeader,
    keys::point_to_symmetric_key::point_to_symmetric_key
};

pub fn compute_encrypted_log<let P: u32, let M: u32>(
    contract_address: AztecAddress,
    ovsk_app: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
    plaintext: [u8; P]
) -> [u8; M] {
    let (eph_sk, eph_pk) = generate_ephemeral_key_pair();

    let header = EncryptedLogHeader::new(contract_address);

    let incoming_header_ciphertext: [u8; 48] = header.compute_ciphertext(eph_sk, ivpk);
    let outgoing_header_ciphertext: [u8; 48] = header.compute_ciphertext(eph_sk, ovpk);
    let incoming_body_ciphertext = compute_incoming_body_ciphertext(plaintext, eph_sk, ivpk);
    let outgoing_body_ciphertext: [u8; 144] = compute_outgoing_body_ciphertext(recipient, ivpk, fr_to_fq(ovsk_app), eph_sk, eph_pk);

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
    let randomness = unsafe {
        random()
    };

    // We use the unsafe version of `fr_to_fq` because multi_scalar_mul (called by derive_public_key) will constrain
    // the scalars.
    let eph_sk = fr_to_fq_unsafe(randomness);
    let eph_pk = derive_public_key(eph_sk);

    (eph_sk, eph_pk)
}

pub fn compute_incoming_body_ciphertext<let P: u32>(plaintext: [u8; P], eph_sk: Scalar, ivpk: IvpkM) -> [u8] {
    let full_key = point_to_symmetric_key(eph_sk, ivpk.to_point());
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
    recipient_ivpk: IvpkM,
    ovsk_app: Scalar,
    eph_sk: Scalar,
    eph_pk: Point
) -> [u8; 144] {
    // Again, we could compute `eph_pk` here, but we keep the interface more similar
    // and also make it easier to optimise it later as we just pass it along
    let mut buffer = [0 as u8; 128];

    let serialized_eph_sk_high: [u8; 32] = eph_sk.hi.to_be_bytes();
    let serialized_eph_sk_low: [u8; 32] = eph_sk.lo.to_be_bytes();

    let address_bytes: [u8; 32] = recipient.to_field().to_be_bytes();
    let serialized_recipient_ivpk = point_to_bytes(recipient_ivpk.to_point());

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
        GENERATOR_INDEX__SYMMETRIC_KEY as Field
    ).to_be_bytes();

    let mut sym_key = [0; 16];
    let mut iv = [0; 16];

    for i in 0..16 {
        sym_key[i] = full_key[i];
        iv[i] = full_key[i + 16];
    }
    aes128_encrypt(buffer, iv, sym_key).as_array()
}

mod test {
    use crate::encrypted_logs::payload::{compute_encrypted_log, compute_incoming_body_ciphertext, compute_outgoing_body_ciphertext};
    use std::embedded_curve_ops::fixed_base_scalar_mul as derive_public_key;
    use dep::protocol_types::{address::AztecAddress, public_keys::{OvpkM, IvpkM}, point::Point, scalar::Scalar};
    use std::test::OracleMock;

    #[test]
    unconstrained fn test_encrypted_log_matches_typescript() {
        // All the values in this test were copied over from `tagged_log.test.ts`
        let contract_address = AztecAddress::from_field(0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04);
        let ovsk_app = 0x03a6513d6def49f41d20373d2cec894c23e7492794b08fc50c0e8a1bd2512612;
        let ovpk_m = OvpkM {
            inner: Point {
                x: 0x1961448682803198631f299340e4206bb12809d4bebbf012b30f59af73ba1a15,
                y: 0x133674060c3925142aceb4f1dcd9f9137d0217d37ff8729ee5ceaa6e2790353d,
                is_infinite: false
            }
        };
        let ivpk_m = IvpkM {
            inner: Point {
                x: 0x260cd3904f6df16e974c29944fdc839e40fb5cf293f03df2eb370851d3a527bc,
                y: 0x0eef2964fe6640e84c82b5d2915892409b38e9e25d39f68dd79edb725c55387f,
                is_infinite: false
            }
        };

        let plaintext = [
            0, 0, 0, 1, 48, 22, 64, 206, 234, 117, 131, 145, 178, 225, 97, 201, 44, 5, 19, 241, 41,
            2, 15, 65, 37, 37, 106, 253, 174, 38, 70, 206, 49, 9, 159, 92, 16, 244, 140, 217, 239,
            247, 174, 91, 32, 156, 85, 124, 112, 222, 46, 101, 126, 231, 145, 102, 134, 134, 118,
            183, 135, 233, 65, 126, 25, 38, 14, 4, 15, 228, 107, 229, 131, 183, 31, 74, 181, 183,
            12, 38, 87, 255, 29, 5, 204, 207, 29, 41, 42, 147, 105, 98, 141, 26, 25, 79, 148, 78,
            101, 153, 0, 0, 16, 39
        ];

        let eph_sk = 0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538;
        let _ = OracleMock::mock("getRandomField").returns(eph_sk);

        let recipient = AztecAddress::from_field(0x10ee41ee4b62703b16f61e03cb0d88c4b306a9eb4a6ceeb2aff13428541689a2);

        let log: [u8; 448] = compute_encrypted_log(contract_address, ovsk_app, ovpk_m, ivpk_m, recipient, plaintext);

        // The following value was generated by `tagged_log.test.ts`
        // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
        let encrypted_log_from_typescript = [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 141, 70, 12, 14, 67, 77, 132, 110, 193, 234, 40, 110, 64, 144, 235,
            86, 55, 111, 242, 123, 221, 193, 170, 202, 225, 216, 86, 84, 159, 112, 31, 167, 126, 79,
            51, 186, 47, 71, 253, 172, 99, 112, 241, 59, 197, 241, 107, 186, 232, 87, 187, 230, 171,
            62, 228, 234, 42, 51, 145, 146, 238, 242, 42, 71, 206, 13, 244, 66, 111, 195, 20, 203,
            98, 148, 204, 242, 145, 183, 156, 29, 141, 54, 44, 220, 194, 35, 229, 16, 32, 204, 211,
            49, 142, 112, 82, 202, 116, 241, 254, 146, 42, 217, 20, 189, 70, 228, 182, 171, 205,
            104, 27, 99, 171, 28, 91, 244, 21, 30, 130, 240, 5, 72, 174, 124, 97, 197, 157, 248,
            193, 23, 193, 76, 46, 141, 144, 70, 211, 45, 67, 167, 218, 129, 140, 104, 190, 41, 110,
            249, 209, 68, 106, 135, 164, 80, 235, 63, 101, 80, 32, 13, 38, 99, 145, 91, 11, 173,
            151, 231, 247, 65, 153, 117, 229, 167, 64, 239, 182, 126, 235, 83, 4, 169, 8, 8, 160, 4,
            235, 252, 21, 96, 84, 161, 69, 145, 145, 215, 254, 161, 117, 246, 198, 65, 89, 179, 194,
            90, 19, 121, 12, 202, 114, 80, 195, 14, 60, 128, 105, 142, 100, 86, 90, 108, 157, 219,
            22, 172, 20, 121, 195, 25, 159, 236, 2, 70, 75, 42, 37, 34, 2, 17, 149, 20, 176, 32, 18,
            204, 56, 117, 121, 34, 15, 3, 88, 123, 64, 68, 74, 233, 63, 59, 131, 222, 194, 192, 167,
            110, 217, 10, 128, 73, 129, 172, 61, 43, 12, 98, 165, 203, 191, 154, 161, 150, 4, 239,
            95, 48, 60, 159, 33, 222, 142, 102, 73, 193, 236, 145, 197, 160, 216, 254, 113, 243, 25,
            244, 251, 192, 222, 35, 7, 114, 101, 35, 152, 151, 112, 24, 32, 94, 138, 71, 160, 91,
            68, 131, 217, 117, 140, 19, 147, 37, 197, 192, 21, 43, 172, 239, 239, 205, 15, 110, 76,
            26, 211, 42, 117, 4, 15, 135, 145, 247, 37, 73, 84, 164, 149, 250, 35, 0, 205, 105, 178,
            143, 104, 98, 100, 250, 193, 154, 136, 175, 177, 109, 225, 207, 252, 147, 250, 250, 189,
            117, 147, 101, 230, 132
        ];
        assert_eq(encrypted_log_from_typescript, log);
    }

    #[test]
    fn test_incoming_body_ciphertext_matches_typescript() {
        // All the values in this test were copied over from `encrypted_note_log_incoming_body.test.ts`
        let eph_sk = Scalar {
            lo: 0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd,
            hi: 0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06
        };
        let ivpk = IvpkM {
            inner: Point {
                x: 0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
                y: 0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e,
                is_infinite: false
            }
        };
        let plaintext = [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3
        ];

        // `compute_incoming_body_ciphertext(...)` function then derives symmetric key from `eph_sk` and `ivpk` and encrypts
        // the note plaintext using AES-128.
        let ciphertext = compute_incoming_body_ciphertext(plaintext, eph_sk, ivpk);

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
            23, 206, 229, 108
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
            hi: 0x000000000000000000000000000000000f096b423017226a18461115fa8d34bb
        };
        let recipient_ivsk = Scalar {
            lo: 0x000000000000000000000000000000004828f8f95676ebb481df163f87fd4022,
            hi: 0x000000000000000000000000000000000f4d97c25d578f9348251a71ca17ae31
        };
        let sender_ovsk_app = Scalar {
            lo: 0x0000000000000000000000000000000074d2e28c6bc5176ac02cf7c7d36a444e,
            hi: 0x00000000000000000000000000000000089c6887cb1446d86c64e81afc78048b
        };

        let eph_pk = derive_public_key(eph_sk);
        let recipient_ivpk = IvpkM { inner: derive_public_key(recipient_ivsk) };

        let recipient = AztecAddress::from_field(0xdeadbeef);

        let ciphertext = compute_outgoing_body_ciphertext(recipient, recipient_ivpk, sender_ovsk_app, eph_sk, eph_pk);

        // The following value was generated by `encrypted_log_outgoing_body.test.ts`
        // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
        let outgoing_body_ciphertext_from_typescript = [
            127, 182, 227, 75, 192, 197, 54, 47, 168, 134, 233, 148, 251, 46, 86, 12, 73, 50, 238,
            50, 31, 174, 27, 202, 110, 77, 161, 197, 244, 124, 17, 100, 143, 150, 232, 14, 156, 248,
            43, 177, 16, 82, 244, 103, 88, 74, 84, 200, 15, 65, 187, 14, 163, 60, 91, 22, 104, 31,
            211, 190, 124, 121, 79, 92, 239, 65, 185, 106, 51, 178, 168, 137, 84, 43, 79, 158, 151,
            152, 83, 42, 170, 13, 106, 209, 254, 74, 39, 145, 73, 215, 17, 234, 196, 89, 30, 58,
            120, 127, 88, 69, 121, 61, 18, 206, 89, 118, 243, 238, 177, 71, 73, 47, 147, 4, 155, 25,
            173, 248, 206, 52, 17, 180, 122, 186, 106, 191, 252, 102, 197, 91, 16, 39, 94, 91, 224,
            30, 168, 177, 26, 144, 5, 124, 128, 6
        ];

        assert_eq(outgoing_body_ciphertext_from_typescript, ciphertext);
    }
}
