use dep::std;
use dep::aztec::constants_gen::GENERATOR_INDEX__CONTRACT_ADDRESS;

fn validate_signature(
    message_hash: [u8;32], // hash of the message payload
    owner: [u8;64], // pubkey x and y coordinates concatenated
    signature: [u8;64], // schnorr signature of the payload hash
    partial_address: Field,
    expected_address: Field,
) {
    // Convert owner pubkey into fields
    let mut x: Field = 0;
    let mut y: Field = 0;
    let mut mul: Field = 1;
    for i in 0..32 {
      let bytex: Field = owner[31 - i] as Field;
      x = x + (bytex * mul);
      let bytey: Field = owner[63 - i] as Field;
      y = y + (bytey * mul);
      mul *= 256;
    }
    
    // Verify signature of the payload hash
    let verification = std::schnorr::verify_signature(x, y, signature, message_hash);
    assert(verification == true);

    // Verify public key against address
    let reproduced_address = dep::std::hash::pedersen_with_separator([x, y, partial_address], GENERATOR_INDEX__CONTRACT_ADDRESS)[0];
    assert(reproduced_address == expected_address);
}