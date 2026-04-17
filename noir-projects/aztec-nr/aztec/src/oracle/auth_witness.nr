#[oracle(aztec_utl_getAuthWitness)]
unconstrained fn get_auth_witness_oracle<let N: u32>(_message_hash: Field) -> [Field; N] {}

/// Oracle wrapper to fetch an `auth_witness` for a given `message_hash` from the PXE.
pub unconstrained fn get_auth_witness<let N: u32>(message_hash: Field) -> [Field; N] {
    get_auth_witness_oracle(message_hash)
}

/// Fetches an auth witness and casts each field to a byte.
///
/// Each field is range-checked to `[0, 256)` before casting to prevent byte-aliasing (e.g. a field value of
/// `b + 256` would truncate to the same byte as `b`).
pub unconstrained fn get_auth_witness_as_bytes<let N: u32>(message_hash: Field) -> [u8; N] {
    fields_to_bytes(get_auth_witness(message_hash))
}

fn fields_to_bytes<let N: u32>(fields: [Field; N]) -> [u8; N] {
    let mut result: [u8; N] = [0; N];
    for i in 0..N {
        assert(fields[i].lt(256), "auth witness field is not a single byte");
        result[i] = fields[i] as u8;
    }
    result
}

#[test]
fn test_fields_to_bytes_valid() {
    let fields: [Field; 3] = [0, 127, 255];
    let bytes = fields_to_bytes(fields);
    assert(bytes[0] == 0);
    assert(bytes[1] == 127);
    assert(bytes[2] == 255);
}

#[test(should_fail_with = "auth witness field is not a single byte")]
fn test_fields_to_bytes_rejects_value_above_byte_range() {
    let _ = fields_to_bytes([256]);
}
