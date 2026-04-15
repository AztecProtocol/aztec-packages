use sha256::sha256_var;
use std::{collections::bounded_vec::BoundedVec, hash::pedersen_hash};
use zkemail::{
    dkim::RSAPubkey, headers::body_hash::get_body_hash,
    headers::email_address::get_email_address, KEY_LIMBS_2048, MAX_EMAIL_ADDRESS_LENGTH, Sequence,
};

// docs:start:globals
global MAX_EMAIL_HEADER_LENGTH: u32 = 512;
global MAX_EMAIL_BODY_LENGTH: u32 = 1024;
// docs:end:globals

// docs:start:circuit
/// Verify a DKIM-signed email and output values for onchain consumption.
///
/// This circuit proves that an email was authentically signed by a mail server's DKIM key,
/// without revealing the email's contents. It outputs four public values:
///
///   [0]: Poseidon hash of DKIM public key modulus (identifies the mail server)
///   [1]: Poseidon hash of DKIM public key reduction parameter
///   [2]: Pedersen hash of DKIM signature (email nullifier -- prevents double-claiming)
///   [3]: Pedersen hash of the sender's email address (identifies the depositor)
fn main(
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    body: BoundedVec<u8, MAX_EMAIL_BODY_LENGTH>,
    pubkey: RSAPubkey<KEY_LIMBS_2048>,
    signature: [Field; KEY_LIMBS_2048],
    body_hash_index: u32,
    dkim_header_sequence: Sequence,
    from_header_sequence: Sequence,
    from_address_sequence: Sequence,
) -> pub [Field; 4] {
    assert(header.len() <= MAX_EMAIL_HEADER_LENGTH);
    assert(body.len() <= MAX_EMAIL_BODY_LENGTH);

    // Verify the DKIM signature over the header (~86K constraints)
    let _ = pubkey.verify_dkim_signature(header, signature);

    // Extract the body hash from the DKIM-Signature header and verify it
    // matches the hash computed over the actual body (~120K constraints)
    let signed_body_hash = get_body_hash(header, dkim_header_sequence, body_hash_index);
    let computed_body_hash: [u8; 32] = sha256_var(body.storage(), body.len() as u32);
    assert(
        signed_body_hash == computed_body_hash,
        "SHA256 hash computed over body does not match body hash found in DKIM-signed header",
    );

    // Extract the sender's email address from the From header (~16K constraints)
    let from_field_name = comptime { "from".as_bytes() };
    let from_address: BoundedVec<u8, MAX_EMAIL_ADDRESS_LENGTH> =
        get_email_address(header, from_header_sequence, from_address_sequence, from_field_name);

    // Hash the sender's address so the contract can match it against deposits.
    // Convert u8 bytes to Field elements for pedersen_hash.
    let mut address_fields: [Field; MAX_EMAIL_ADDRESS_LENGTH] = [0; MAX_EMAIL_ADDRESS_LENGTH];
    let addr_storage = from_address.storage();
    for i in 0..MAX_EMAIL_ADDRESS_LENGTH {
        address_fields[i] = addr_storage[i] as Field;
    }
    let from_address_hash = pedersen_hash(address_fields);

    // Compute standard outputs (~10K constraints)
    let email_nullifier = pedersen_hash(signature);
    let pubkey_hash = pubkey.hash();

    [pubkey_hash[0], pubkey_hash[1], email_nullifier, from_address_hash]
}
// docs:end:circuit
