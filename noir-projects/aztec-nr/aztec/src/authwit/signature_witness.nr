/// Prevents byte-aliasing of untrusted auth witness fields.
///
/// Auth witnesses are fetched from an untrusted oracle as `[Field; N]`, where each field should encode one signature
/// byte. Simply truncating to `u8` is not enough because a field value like `b + 256` would truncate to the same byte
/// as `b`, so each field is range-checked to `[0, 256)` before casting to ensure a unique canonical encoding.
pub fn auth_witness_to_byte_signature<let N: u32>(witness: [Field; N]) -> [u8; N] {
    let mut signature: [u8; N] = [0; N];
    for i in 0..N {
        assert(witness[i].lt(256), "auth witness field is not a single byte");
        signature[i] = witness[i] as u8;
    }
    signature
}

#[test]
fn test_valid_witness() {
    let witness: [Field; 3] = [0, 127, 255];
    let sig = auth_witness_to_byte_signature(witness);
    assert(sig[0] == 0);
    assert(sig[1] == 127);
    assert(sig[2] == 255);
}

#[test(should_fail_with = "auth witness field is not a single byte")]
fn test_rejects_value_above_byte_range() {
    let witness: [Field; 1] = [256];
    let _ = auth_witness_to_byte_signature(witness);
}
