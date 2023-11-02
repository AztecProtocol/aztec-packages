use dep::std;

fn main(pub_key_x : pub [u8; 32], pub_key_y : pub [u8; 32], signature : [u8; 64], hashed_message : [u8; 32]) {
    assert(true == std::ecdsa_secp256k1::verify_signature(pub_key_x, pub_key_y, signature, hashed_message));
}