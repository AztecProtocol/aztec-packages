use dep::protocol_types::{
    address::AztecAddress, scalar::Scalar, point::Point, constants::GENERATOR_INDEX__SYMMETRIC_KEY,
    hash::poseidon2_hash_with_separator
};

use std::aes128::aes128_encrypt;

use crate::keys::point_to_symmetric_key::point_to_symmetric_key;

struct EncryptedLogOutgoingBody {
    eph_sk: Scalar,
    recipient: AztecAddress,
    recipient_ivpk_app: Point,
}

impl EncryptedLogOutgoingBody {
    pub fn new(eph_sk: Scalar, recipient: AztecAddress, recipient_ivpk_app: Point) -> Self {
        Self { eph_sk, recipient, recipient_ivpk_app }
    }

    pub fn compute_ciphertext(self, ovsk_app: Scalar, eph_pk: Point) -> [u8; 176] {
        // Again, we could compute `eph_pk` here, but we keep the interface more similar
        // and also make it easier to optimise it later as we just pass it along

        let mut buffer: [u8; 160] = [0; 160];

        let serialized_eph_sk_high = self.eph_sk.hi.to_be_bytes(32);
        let serialized_eph_sk_low = self.eph_sk.lo.to_be_bytes(32);

        let address_bytes = self.recipient.to_field().to_be_bytes(32);
        let serialized_recipient_ivpk_app = self.recipient_ivpk_app.serialize();
        let serialized_recipient_ivpk_app_x = serialized_recipient_ivpk_app[0].to_be_bytes(32);
        let serialized_recipient_ivpk_app_y = serialized_recipient_ivpk_app[1].to_be_bytes(32);

        for i in 0..32 {
            buffer[i] = serialized_eph_sk_high[i];
            buffer[i + 32] = serialized_eph_sk_low[i];
            buffer[i + 64] = address_bytes[i];
            buffer[i + 96] = serialized_recipient_ivpk_app_x[i];
            buffer[i + 128] = serialized_recipient_ivpk_app_y[i];
        }

        // We compute the symmetric key using poseidon.
        let full_key: [u8; 32] = poseidon2_hash_with_separator(
            [ovsk_app.hi, ovsk_app.lo, eph_pk.x, eph_pk.y],
            GENERATOR_INDEX__SYMMETRIC_KEY as Field
        ).to_be_bytes(32).as_array();

        let mut sym_key = [0; 16];
        let mut iv = [0; 16];

        for i in 0..16 {
            sym_key[i] = full_key[i];
            iv[i] = full_key[i + 16];
        }
        aes128_encrypt(buffer, iv, sym_key).as_array()
    }
}

mod test {
    use crate::encrypted_logs::outgoing_body::EncryptedLogOutgoingBody;
    use dep::protocol_types::{
        address::AztecAddress, traits::Empty, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        scalar::Scalar, point::Point, hash::poseidon2_hash_with_separator
    };

    use crate::context::PrivateContext;

    #[test]
    fn test_encrypted_log_outgoing_body() {
        let eph_sk = Scalar::new(
            0x00000000000000000000000000000000d0d302ee245dfaf2807e604eec4715fe,
            0x000000000000000000000000000000000f096b423017226a18461115fa8d34bb
        );
        let recipient_ivsk_app = Scalar::new(
            0x000000000000000000000000000000004828f8f95676ebb481df163f87fd4022,
            0x000000000000000000000000000000000f4d97c25d578f9348251a71ca17ae31
        );
        let sender_ovsk_app = Scalar::new(
            0x0000000000000000000000000000000074d2e28c6bc5176ac02cf7c7d36a444e,
            0x00000000000000000000000000000000089c6887cb1446d86c64e81afc78048b
        );

        let eph_pk = eph_sk.derive_public_key();
        let recipient_ivpk_app = recipient_ivsk_app.derive_public_key();

        let recipient = AztecAddress::from_field(0xdeadbeef);

        let body = EncryptedLogOutgoingBody::new(eph_sk, recipient, recipient_ivpk_app);

        let ciphertext = body.compute_ciphertext(sender_ovsk_app, eph_pk);

        let expected_outgoing_body_ciphertext = [
            0, 83, 142, 191, 122, 69, 20, 74, 15, 113, 176, 1, 204, 14, 162, 77, 147, 137, 225, 52, 110, 197, 153, 143, 90, 148, 44, 107, 83, 148, 151, 57, 124, 137, 136, 9, 80, 218, 119, 233, 93, 170, 3, 100, 96, 59, 93, 92, 141, 6, 240, 245, 23, 216, 120, 49, 224, 214, 83, 87, 45, 102, 125, 231, 253, 215, 89, 189, 159, 28, 64, 83, 237, 40, 78, 237, 65, 252, 187, 4, 86, 126, 50, 47, 199, 227, 110, 103, 22, 112, 10, 182, 185, 123, 237, 175, 14, 212, 233, 12, 231, 41, 121, 28, 61, 82, 235, 118, 142, 22, 13, 119, 89, 194, 119, 154, 222, 26, 159, 100, 199, 62, 236, 26, 16, 247, 202, 151, 83, 24, 186, 221, 98, 198, 46, 198, 112, 189, 4, 252, 2, 111, 196, 134, 38, 86, 218, 13, 28, 163, 41, 60, 48, 181, 243, 49, 254, 8, 99, 62, 254, 209, 66, 98, 40, 2, 111, 95, 216, 246, 127, 242, 115, 46, 229, 176
        ];

        for i in 0..expected_outgoing_body_ciphertext.len() {
            assert_eq(ciphertext[i], expected_outgoing_body_ciphertext[i]);
        }
        assert_eq(expected_outgoing_body_ciphertext.len(), ciphertext.len());
    }
}
