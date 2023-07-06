use dep::std;
mod base64;
use base64::decode_base64;

fn main(_zero: u8, challenge : [u8; 32], auth_data : [u8; 37], client_data_json : [u8;134], pub_key_x : [u8;32], pub_key_y : [u8;32], signature : [u8;64]) {
     let mut base64_challenge: [u8; 43] = [0;43];
     for i in 0..43 {
          base64_challenge[i] = client_data_json[i + 36];
     }
     // std::println(base64_challenge);
     let decoded_challenge = decode_base64(base64_challenge);
     // std::println(decoded_challenge);
     assert(decoded_challenge == challenge);

     let client_data_hash = std::hash::sha256(client_data_json);
     let mut message: [u8; 69] = [0;69];
     for i in 0..37 {
          message[i] = auth_data[i];
     }
     for i in 0..32 {
          message[i+37] = client_data_hash[i];
     }
     let message_hash = std::hash::sha256(message);
     let valid_signature = std::ecdsa_secp256r1::verify_signature(pub_key_x, pub_key_y, signature, message_hash);
     assert(valid_signature);
}