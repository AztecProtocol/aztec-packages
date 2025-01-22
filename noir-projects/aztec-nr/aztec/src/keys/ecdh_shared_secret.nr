use dep::protocol_types::{address::aztec_address::AztecAddress, point::Point, scalar::Scalar};
use std::embedded_curve_ops::multi_scalar_mul;

pub fn derive_ecdh_shared_secret(secret: Scalar, public_key: Point) -> Point {
    let shared_secret = multi_scalar_mul([public_key], [secret]);
    shared_secret
}

// Handles the ugly conversion from an AztecAddress to a Point.
pub fn derive_ecdh_shared_secret_using_aztec_address(
    secret: Scalar,
    address: AztecAddress,
) -> Point {
    derive_ecdh_shared_secret(secret, address.to_address_point().inner)
}

#[test]
unconstrained fn test_derive_aes_secret() {
    let secret = Scalar {
        lo: 0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd,
        hi: 0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06,
    };
    let point = Point {
        x: 0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
        y: 0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e,
        is_infinite: false,
    };

    let key = derive_ecdh_shared_secret(secret, point);

    // This is just pasted from a test run.
    // The original typescript code from which this could be generated seems to have been deleted by someone, and soon the typescript code for encryption and decryption won't be needed, so this will have to do.
    let hard_coded_key = Point {
        x: 0x15d55a5b3b2caa6a6207f313f05c5113deba5da9927d6421bcaa164822b911bc,
        y: 0x0974c3d0825031ae933243d653ebb1a0b08b90ee7f228f94c5c74739ea3c871e,
        is_infinite: false,
    };
    assert_eq(key, hard_coded_key);
}
