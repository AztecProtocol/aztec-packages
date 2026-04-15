use std::collections::bounded_vec::BoundedVec;
use poseidon::poseidon2::Poseidon2;
use zkemail::{
    dkim::RSAPubkey, headers::email_address::get_email_address, KEY_LIMBS_2048,
    MAX_EMAIL_ADDRESS_LENGTH, Sequence,
};

// docs:start:globals
global MAX_EMAIL_HEADER_LENGTH: u32 = 512;
global MAX_SUBJECT_LENGTH: u32 = 128;
global MAX_TIMESTAMP_DIGITS: u32 = 10;
global EXPECTED_DOMAIN: [u8; 10] = comptime { "icloud.com".as_bytes() };
// docs:end:globals

// docs:start:circuit
/// Verify a DKIM-signed email and extract authentication data.
///
/// Proves: sender is from icloud.com, recipient matches, subject encodes intent,
/// email is timestamped, and provides a nullifier to prevent reuse.
///
/// Body verification is omitted -- all auth-relevant data is in DKIM-signed headers,
/// avoiding the extra SHA256 hashing cost of body verification.
///
/// Returns:
///   [0]: Poseidon hash of DKIM public key modulus (root of trust)
///   [1]: Poseidon hash of DKIM public key redc parameter
///   [2]: Email nullifier (Poseidon2 hash of DKIM signature -- prevents replay)
///   [3]: Poseidon2 hash of sender (from) email address (depositor identification)
///   [4]: Poseidon2 hash of recipient (to) email address (recipient binding)
///   [5]: Poseidon2 hash of email subject (intent binding)
///   [6]: DKIM signing timestamp in seconds since epoch (freshness)
fn main(
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    pubkey: RSAPubkey<KEY_LIMBS_2048>,
    signature: [Field; KEY_LIMBS_2048],
    dkim_header_sequence: Sequence,
    from_header_sequence: Sequence,
    from_address_sequence: Sequence,
    to_header_sequence: Sequence,
    to_address_sequence: Sequence,
    subject_header_sequence: Sequence,
    dkim_timestamp_index: u32,
) -> pub [Field; 7] {
    assert(header.len() <= MAX_EMAIL_HEADER_LENGTH);

    // 1. Verify the DKIM signature over the email header
    let _ = pubkey.verify_dkim_signature(header, signature);

    // 2. Extract and verify the sender's domain is icloud.com, then hash the full address.
    //    The domain check restricts which mail servers are trusted. The full address hash
    //    identifies the specific sender (e.g. bob@icloud.com) for deposit lookup.
    //    NOTE: Header field names are matched in lowercase. This assumes DKIM
    //    c=relaxed canonicalization, which lowercases header names before signing.
    let from_address: BoundedVec<u8, MAX_EMAIL_ADDRESS_LENGTH> = get_email_address(
        header,
        from_header_sequence,
        from_address_sequence,
        comptime { "from".as_bytes() },
    );
    verify_domain(from_address, EXPECTED_DOMAIN);
    let from_address_hash = hash_address(from_address);

    // 3. Extract recipient (to) address and hash for recipient binding
    let to_address: BoundedVec<u8, MAX_EMAIL_ADDRESS_LENGTH> = get_email_address(
        header,
        to_header_sequence,
        to_address_sequence,
        comptime { "to".as_bytes() },
    );
    let to_address_hash = hash_address(to_address);

    // 4. Extract subject and hash for intent binding
    let intent_hash = extract_and_hash_subject(header, subject_header_sequence);

    // 5. Parse the DKIM signing timestamp (t= tag) for freshness checks
    let timestamp = extract_dkim_timestamp(header, dkim_header_sequence, dkim_timestamp_index);

    // 6. Compute email nullifier and public key hash
    let email_nullifier = Poseidon2::hash(signature, KEY_LIMBS_2048);
    let pubkey_hash = pubkey.hash();

    [pubkey_hash[0], pubkey_hash[1], email_nullifier, from_address_hash, to_address_hash, intent_hash, timestamp]
}
// docs:end:circuit

/// Verify the domain part of an email address matches the expected domain.
fn verify_domain<let DOMAIN_LEN: u32>(
    address: BoundedVec<u8, MAX_EMAIL_ADDRESS_LENGTH>,
    expected_domain: [u8; DOMAIN_LEN],
) {
    let mut at_index: u32 = 0;
    let mut found_at = false;
    for i in 0..MAX_EMAIL_ADDRESS_LENGTH {
        if i < address.len() {
            if address.get_unchecked(i) == 64 {
                // '@'
                at_index = i + 1;
                found_at = true;
            }
        }
    }
    assert(found_at, "No @ symbol found in email address");

    let domain_len = address.len() - at_index;
    assert(domain_len == DOMAIN_LEN as u32, "Domain length mismatch");
    for i in 0..DOMAIN_LEN {
        assert(
            address.get_unchecked(at_index + i) == expected_domain[i],
            "Email domain does not match expected",
        );
    }
}

/// Hash an email address deterministically using Poseidon2 over packed 31-byte fields.
///
/// Packs address bytes big-endian into ceil(320/31)=11 Field elements, appends length.
fn hash_address(address: BoundedVec<u8, MAX_EMAIL_ADDRESS_LENGTH>) -> Field {
    // ceil(320/31) = 11 packed fields + 1 length field
    let mut packed: [Field; 12] = [0; 12];
    for i in 0..MAX_EMAIL_ADDRESS_LENGTH {
        if i < address.len() {
            let field_idx = i / 31;
            packed[field_idx] = packed[field_idx] * 256 + address.get_unchecked(i) as Field;
        }
    }
    packed[11] = address.len() as Field;
    Poseidon2::hash(packed, 12)
}

/// Extract and validate the subject header field, then hash its value for intent binding.
///
/// Validates the "subject:" prefix and CRLF boundaries to prevent header injection.
/// Hashes subject value bytes (after prefix) using Poseidon2 over packed fields.
fn extract_and_hash_subject(
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    subject_sequence: Sequence,
) -> Field {
    // Validate "subject:" prefix
    let prefix: [u8; 8] = comptime { "subject:".as_bytes() };
    for i in 0..8 {
        assert(
            header.get_unchecked(subject_sequence.index + i) == prefix[i],
            "Invalid subject header prefix",
        );
    }

    // Validate CRLF boundary before field (or start of header)
    if subject_sequence.index > 0 {
        assert(
            header.get_unchecked(subject_sequence.index - 1) == 10, // LF
            "Subject field must follow a line feed",
        );
    }

    // Validate CR after field (start of CRLF terminator)
    let end_idx = subject_sequence.index + subject_sequence.length;
    assert(end_idx < header.len(), "Subject extends past header");
    assert(
        header.get_unchecked(end_idx) == 13, // CR
        "Subject field must end before carriage return",
    );

    // Extract subject value bytes (after "subject:" prefix)
    let value_start = subject_sequence.index + 8;
    let value_len = subject_sequence.length - 8;
    assert(value_len <= MAX_SUBJECT_LENGTH, "Subject too long");

    // Hash subject value: pack into ceil(128/31)=5 fields + 1 length field
    let mut packed: [Field; 6] = [0; 6];
    for i in 0..MAX_SUBJECT_LENGTH {
        if i < value_len {
            let field_idx = i / 31;
            packed[field_idx] = packed[field_idx] * 256
                + header.get_unchecked(value_start + i) as Field;
        }
    }
    packed[5] = value_len as Field;
    Poseidon2::hash(packed, 6)
}

/// Extract the DKIM signing timestamp from the t= tag in the DKIM-Signature header.
///
/// The prover supplies the index of the first timestamp digit. The circuit verifies
/// the "t=" prefix and parses the decimal value. This timestamp represents when the
/// mail server signed the email.
fn extract_dkim_timestamp(
    header: BoundedVec<u8, MAX_EMAIL_HEADER_LENGTH>,
    dkim_sequence: Sequence,
    timestamp_index: u32,
) -> Field {
    // Verify timestamp_index falls strictly within the DKIM header field.
    // Both the "t=" prefix and all digits must be inside the DKIM-Signature sequence,
    // otherwise a prover could point to a t= in a later, unsigned header line.
    let dkim_end = dkim_sequence.index + dkim_sequence.length;
    assert(
        timestamp_index >= dkim_sequence.index + 2,
        "Timestamp index too early in DKIM header",
    );
    assert(
        timestamp_index + MAX_TIMESTAMP_DIGITS <= dkim_end,
        "Timestamp digits extend past DKIM header field",
    );

    // Verify "t=" prefix immediately before the digits
    assert(
        header.get_unchecked(timestamp_index - 2) == 116, // 't'
        "Expected 't' before timestamp value",
    );
    assert(
        header.get_unchecked(timestamp_index - 1) == 61, // '='
        "Expected '=' before timestamp value",
    );

    // Parse decimal digits until non-digit (';' or end of header field).
    // The first byte must be a digit to prevent parsing an empty t= value as 0.
    let first_byte = header.get_unchecked(timestamp_index);
    assert((first_byte >= 48) & (first_byte <= 57), "Timestamp must start with a digit");

    let mut timestamp: Field = (first_byte - 48) as Field;
    let mut done = false;
    for i in 1..MAX_TIMESTAMP_DIGITS {
        if !done {
            let byte = header.get_unchecked(timestamp_index + i);
            if (byte >= 48) & (byte <= 57) {
                // '0'-'9'
                timestamp = timestamp * 10 + (byte - 48) as Field;
            } else {
                done = true;
            }
        }
    }

    timestamp
}
