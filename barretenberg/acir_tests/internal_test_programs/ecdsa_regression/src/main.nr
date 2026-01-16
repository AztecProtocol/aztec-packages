fn main(
    pub_key_x: pub [u8;32],
    pub_key_y: pub [u8;32],
    signature: pub [u8;64], // r || s
    hashed_message: pub [u8;32],
    key_type: u8,
) {
    if key_type == 1 {
        assert(std::ecdsa_secp256k1::verify_signature(
            pub_key_x,
            pub_key_y,
            signature,
            hashed_message,
        ));
    } else if key_type == 2 {
        assert(std::ecdsa_secp256r1::verify_signature(
            pub_key_x,
            pub_key_y,
            signature,
            hashed_message,
        ));
    }
}
