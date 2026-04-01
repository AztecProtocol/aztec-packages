//! Blake2s hash tests

#[cfg(test)]
use barretenberg_rs::Fr;
#[cfg(test)]
use crate::require_bb_binary;

#[test]
fn test_blake2s() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let input = b"abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    let expected: [u8; 32] = [
        0x44, 0xdd, 0xdb, 0x39, 0xbd, 0xb2, 0xaf, 0x80, 0xc1, 0x47, 0x89, 0x4c, 0x1d, 0x75, 0x6a,
        0xda, 0x3d, 0x1c, 0x2a, 0xc2, 0xb1, 0x00, 0x54, 0x1e, 0x04, 0xfe, 0x87, 0xb4, 0xa5, 0x9e,
        0x12, 0x43,
    ];

    let response = api.blake2s(input).expect("Blake2s failed");
    assert_eq!(response.hash.as_slice(), &expected, "Blake2s hash mismatch");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_blake2s_to_field() {
    require_bb_binary!();
    let (mut api, mut _bb_child) = crate::utils::spawn_bb_api();

    let input = b"abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    let expected = Fr([
        20, 121, 140, 198, 220, 129, 15, 87, 8, 247, 67, 149, 155, 244, 18, 125,
        20, 232, 66, 122, 55, 70, 227, 140, 193, 28, 146, 32, 181, 158, 18, 66,
    ]);

    let response = api.blake2s_to_field(input).expect("Blake2sToField failed");
    assert_eq!(response.field, expected, "Blake2sToField result mismatch");

    api.destroy().expect("Failed to destroy backend");
}
