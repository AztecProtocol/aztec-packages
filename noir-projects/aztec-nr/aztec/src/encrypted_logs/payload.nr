use dep::protocol_types::{
    address::AztecAddress,
    constants::{GENERATOR_INDEX__SYMMETRIC_KEY, PRIVATE_LOG_SIZE_IN_FIELDS},
    hash::{poseidon2_hash, poseidon2_hash_with_separator},
    point::Point,
    public_keys::{AddressPoint, OvpkM},
    scalar::Scalar,
    utils::arrays::array_concat,
};
use std::{
    aes128::aes128_encrypt, embedded_curve_ops::fixed_base_scalar_mul as derive_public_key,
    field::bn254::decompose, hash::from_field_unsafe as fr_to_fq_unsafe,
};

use crate::{
    encrypted_logs::header::EncryptedLogHeader,
    keys::point_to_symmetric_key::point_to_symmetric_key,
    oracle::{
        notes::{get_app_tag_as_sender, increment_app_tagging_secret_index_as_sender},
        random::random,
    },
    utils::{bytes::bytes_to_fields, point::point_to_bytes},
};

// 1 field is reserved for tag.
global ENCRYPTED_PAYLOAD_SIZE_IN_BYTES: u32 = (PRIVATE_LOG_SIZE_IN_FIELDS - 1) * 31;

comptime global HEADER_SIZE: u32 = 48;

comptime global OUTGOING_BODY_SIZE: u32 = 112;

// Bytes padded to the overhead, so that the size of the incoming body ciphertext will be a multiple of 16.
comptime global OVERHEAD_PADDING: u32 = 15;

pub comptime global OVERHEAD_SIZE: u32 = 32 /* eph_pk */
    + HEADER_SIZE /* incoming_header */
    + HEADER_SIZE /* outgoing_header */
    + OUTGOING_BODY_SIZE /* outgoing_body */
    + OVERHEAD_PADDING /* padding */;

global PLAINTEXT_LENGTH_SIZE: u32 = 2;

// This is enough for 8 fields of data.
// 1 field for storage slot, 1 field for note/event type id, allowing 6 fields for custom values.
global MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES: u32 =
    ENCRYPTED_PAYLOAD_SIZE_IN_BYTES - OVERHEAD_SIZE - PLAINTEXT_LENGTH_SIZE - 1 /* aes padding */;

// Note: Might have to update PRIVATE_LOG_SIZE_IN_FIELDS in `constants.nr` if the above changes.
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
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS] {
    assert(
        P < MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES,
        f"plaintext for log must not exceed {MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES}",
    );

    let extended_plaintext: [u8; MAX_PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES + PLAINTEXT_LENGTH_SIZE] =
        extend_private_log_plaintext(plaintext);
    let encrypted: [u8; ENCRYPTED_PAYLOAD_SIZE_IN_BYTES] = compute_encrypted_log(
        contract_address,
        ovsk_app,
        ovpk,
        recipient,
        extended_plaintext,
    );

    // We assume that the sender wants for the recipient to find the tagged note, and therefore that they will cooperate
    // and use the correct tag. Usage of a bad tag will result in the recipient not being able to find the note
    // automatically.
    let tag = unsafe { get_app_tag_as_sender(sender, recipient) };
    increment_app_tagging_secret_index_as_sender(sender, recipient);

    array_concat([tag], bytes_to_fields(encrypted))
}

pub fn compute_partial_public_log_payload<let P: u32, let M: u32>(
    contract_address: AztecAddress,
    ovsk_app: Field,
    ovpk: OvpkM,
    recipient: AztecAddress,
    sender: AztecAddress,
    plaintext: [u8; P],
) -> [u8; M] {
    let extended_plaintext: [u8; P + PLAINTEXT_LENGTH_SIZE] =
        extend_private_log_plaintext(plaintext);
    let encrypted: [u8; M - 32] = compute_encrypted_log(
        contract_address,
        ovsk_app,
        ovpk,
        recipient,
        extended_plaintext,
    );

    // We assume that the sender wants for the recipient to find the tagged note, and therefore that they will cooperate
    // and use the correct tag. Usage of a bad tag will result in the recipient not being able to find the note
    // automatically.
    let tag = unsafe { get_app_tag_as_sender(sender, recipient) };
    increment_app_tagging_secret_index_as_sender(sender, recipient);
    // Silo the tag with contract address.
    // This is done by the kernel circuit to the private logs, but since the partial log will be finalized and emitted
    // in public as unencrypted log, its tag is not siloed at the moment.
    // To avoid querying logs using two types of tags, we silo the tag manually here.
    // TODO(#10273) This should be done by the AVM when it's processing the raw logs instead of their hashes.
    let siloed_tag_bytes: [u8; 32] =
        poseidon2_hash([contract_address.to_field(), tag]).to_be_bytes();

    // Temporary hack so that the partial public log remains the same format.
    // It should return field array and make the tag the first field as compute_private_log_payload does.
    let mut log_bytes = [0; M];
    for i in 0..32 {
        log_bytes[i] = siloed_tag_bytes[i];
    }
    for i in 0..encrypted.len() {
        log_bytes[i + 32] = encrypted[i];
    }

    log_bytes
}

fn compute_encrypted_log<let P: u32, let M: u32>(
    contract_address: AztecAddress,
    ovsk_app: Field,
    ovpk: OvpkM,
    recipient: AztecAddress,
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
        encrypted_bytes[offset + HEADER_SIZE + i] = outgoing_header_ciphertext[i];
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
        padded[i + PLAINTEXT_LENGTH_SIZE] = plaintext[i];
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

        let payload = compute_private_log_payload(
            contract_address,
            ovsk_app,
            ovpk_m,
            recipient,
            sender,
            plaintext,
        );

        // The following value was generated by `encrypted_log_payload.test.ts`
        // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
        let private_log_payload_from_typescript = [
            0x0e9cffc3ddd746affb02410d8f0a823e89939785bcc8e88ee4f3cae05e737c36,
            0x008d460c0e434d846ec1ea286e4090eb56376ff27bddc1aacae1d856549f701f,
            0x00a70577790aeabcc2d81ec8d0c99e7f5d2bf2f1452025dc777a178404f851d9,
            0x003de818923f85187871d99bdf95d695eff0a9e09ba15153fc9b4d224b6e1e71,
            0x00dfbdcaab06c09d5b3c749bfebe1c0407eccd04f51bbb59142680c8a091b97f,
            0x00c6cbcf615def593ab09e5b3f7f58f6fc235c90e7c77ed8dadb3b05ee4545a7,
            0x00bc612c9139475fee6070be47efcc43a5cbbc873632f1428fac952df9c181db,
            0x005f9e850b21fe11fedef37b88caee95111bce776e488df219732d0a77d19201,
            0x007047186f41445ecd5c603487f7fb3c8f31010a22af69ce0000000000000000,
            0x0000000000000000a600a61f7d59eeaf52eb51bc0592ff981d9ba3ea8e6ea8ba,
            0x009dc0cec8c70b81e84556a77ce6c3ca47a527f99ffe7b2524bb885a23020b72,
            0x0095748ad19c1083618ad96298b76ee07eb1a56d19cc798710e9f5de96501bd5,
            0x009b3781c9c02a6c95c5912f8936b1500d362afbf0922c85b1ada18db8b95162,
            0x00a6e9d067655cdf669eb387f8e0492a95fdcdb39429d5340b4bebc250ba9bf6,
            0x002c2f49f549f37beed75a668aa51967e0e57547e5a655157bcf381e22f30e25,
            0x00881548ec9606a151b5fbfb2d14ee4b34bf4c1dbd71c7be15ad4c63474bb6f8,
            0x009970aeb3d9489c8edbdff80a1a3a5c28370e534abc870a85ea4318326ea192,
            0x0022fb10df358c765edada497db4284ae30507a2e03e983d23cfa0bd831577e8,
        ];

        assert_eq(payload, private_log_payload_from_typescript);
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
