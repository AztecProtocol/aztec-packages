#[oracle(aztec_utl_getAuthWitness)]
unconstrained fn get_auth_witness_oracle<let N: u32>(_message_hash: Field) -> [Field; N] {}

/// Oracle wrapper to fetch an `auth_witness` for a given `message_hash` from the PXE.
pub unconstrained fn get_auth_witness<let N: u32>(message_hash: Field) -> [Field; N] {
    get_auth_witness_oracle(message_hash)
}

/// Fetches an auth witness and casts each field to a byte.
///
/// Each field is range-checked to `[0, 256)` before casting to prevent silent truncation (e.g. a field value of
/// `b + 256` would truncate to the same byte as `b`).
pub unconstrained fn get_auth_witness_as_bytes<let N: u32>(message_hash: Field) -> [u8; N] {
    let witness = get_auth_witness::<N>(message_hash);
    let mut result: [u8; N] = [0; N];
    for i in 0..N {
        assert(witness[i].lt(256), "auth witness field is not a single byte");
        result[i] = witness[i] as u8;
    }
    result
}

mod test {
    use super::get_auth_witness_as_bytes;
    use std::test::OracleMock;

    #[test]
    unconstrained fn get_auth_witness_as_bytes_casts_valid_witness() {
        let witness: [Field; 3] = [0, 127, 255];
        let _ = OracleMock::mock("aztec_utl_getAuthWitness").returns(witness);
        let bytes: [u8; 3] = get_auth_witness_as_bytes(0);
        assert_eq(bytes, [0, 127, 255]);
    }

    #[test(should_fail_with = "auth witness field is not a single byte")]
    unconstrained fn get_auth_witness_as_bytes_rejects_field_above_byte_range() {
        let witness: [Field; 1] = [256];
        let _ = OracleMock::mock("aztec_utl_getAuthWitness").returns(witness);
        let _: [u8; 1] = get_auth_witness_as_bytes(0);
    }
}
