use dep::protocol_types::{
    address::AztecAddress, grumpkin_private_key::GrumpkinPrivateKey,
    embedded_curve_point::EmbeddedCurvePoint
};

use crate::keys::point_to_symmetric_key::point_to_symmetric_key;

use std::aes128::aes128_encrypt;

struct EncryptedLogHeader {
    address: AztecAddress,
}

impl EncryptedLogHeader {
    fn new(address: AztecAddress) -> Self {
        EncryptedLogHeader { address }
    }

    fn compute_ciphertext(self, secret: GrumpkinPrivateKey, point: EmbeddedCurvePoint) -> [u8; 48] {
        let full_key = point_to_symmetric_key(secret, point);
        let mut sym_key = [0; 16];
        let mut iv = [0; 16];

        for i in 0..16 {
            sym_key[i] = full_key[i];
            iv[i] = full_key[i + 16];
        }

        let input: [u8; 32] = self.address.to_field().to_be_bytes(32).as_array();
        aes128_encrypt(input, iv, sym_key).as_array()
    }
}

#[test]
fn test_encrypted_log_header() {
    let address = AztecAddress::from_field(0xdeadbeef);
    let header = EncryptedLogHeader::new(address);
    let secret = GrumpkinPrivateKey::new(
        0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06,
        0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd
    );
    let point = EmbeddedCurvePoint::new(
        0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
        0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e,
        false
    );

    let ciphertext = header.compute_ciphertext(secret, point);

    let expected_header_ciphertext = [
        231, 126, 15, 225, 68, 138, 75, 80, 237, 178, 203, 27, 105, 200, 174, 176, 13, 215, 25, 216, 87, 111, 139, 0, 194, 150, 46, 225, 239, 245, 202, 110, 136, 199, 199, 116, 235, 135, 120, 182, 189, 166, 24, 172, 157, 153, 23, 195
    ];

    assert_eq(ciphertext, expected_header_ciphertext);
}
