use dep::protocol_types::{
    address::aztec_address::AztecAddress, point::Point, scalar::Scalar, traits::FromField,
};
use std::{embedded_curve_ops::multi_scalar_mul, ops::Neg};

/// Computes a standard ecdh shared secret: [secret] * public_key = shared_secret.
/// The input secret is known only to one party. The output shared secret is derivable
/// by both parties, through this function.
/// E.g.:
/// Epk = esk * G // ephemeral keypair
/// Pk = sk * G // recipient keypair
/// Shared secret S = esk * Pk = sk * Epk // see how this function can be called with two different sets of inputs, depending on which secret the caller knows (either esk or sk)?
// See also: https://en.wikipedia.org/wiki/Elliptic-curve_Diffie%E2%80%93Hellman
pub fn derive_ecdh_shared_secret(secret: Scalar, public_key: Point) -> Point {
    let shared_secret = multi_scalar_mul([public_key], [secret]);
    shared_secret
}

/// Computes a standard ECDH shared secret using the public key corresponding to an AztecAddress:
///
/// # Formula
/// `[ephemeral_secret] * recipient_address_public_key = shared_secret`
///
/// # Usage
/// The intention is that the _creator_ of a shared secret calls this function,
/// providing the address of their intended recipient.
///
/// # Note
/// The function returns `Option<Point>` because the recipient address might be invalid
/// (i.e., not correspond to a point on the curve). Callers must handle the `None` case.
/// This is unlike `derive_ecdh_shared_secret`, which always returns a `Point` because it
/// operates on guaranteed-valid inputs.
pub fn derive_ecdh_shared_secret_using_aztec_address(
    ephemeral_secret: Scalar,
    recipient_address: AztecAddress,
) -> Option<Point> {
    recipient_address.to_address_point().map(|addr_point| {
        derive_ecdh_shared_secret(ephemeral_secret, addr_point.inner)
    })
}

#[test]
unconstrained fn test_consistency_with_typescript() {
    let secret = Scalar {
        lo: 0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd,
        hi: 0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06,
    };
    let point = Point {
        x: 0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
        y: 0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e,
        is_infinite: false,
    };

    let shared_secret = derive_ecdh_shared_secret(secret, point);

    // This is just pasted from a test run.
    // The original typescript code from which this could be generated seems to have been deleted by someone, and soon the typescript code for encryption and decryption won't be needed, so this will have to do.
    let hard_coded_shared_secret = Point {
        x: 0x15d55a5b3b2caa6a6207f313f05c5113deba5da9927d6421bcaa164822b911bc,
        y: 0x0974c3d0825031ae933243d653ebb1a0b08b90ee7f228f94c5c74739ea3c871e,
        is_infinite: false,
    };
    assert_eq(shared_secret, hard_coded_shared_secret);
}

#[test]
unconstrained fn test_shared_secret_computation_in_both_directions() {
    let secret_a = Scalar { lo: 0x1234, hi: 0x2345 };
    let secret_b = Scalar { lo: 0x3456, hi: 0x4567 };

    let pk_a = std::embedded_curve_ops::fixed_base_scalar_mul(secret_a);
    let pk_b = std::embedded_curve_ops::fixed_base_scalar_mul(secret_b);

    let shared_secret = derive_ecdh_shared_secret(secret_a, pk_b);
    let shared_secret_alt = derive_ecdh_shared_secret(secret_b, pk_a);

    assert_eq(shared_secret, shared_secret_alt);
}

#[test]
unconstrained fn test_shared_secret_computation_from_address_in_both_directions() {
    let secret_a = Scalar { lo: 0x1234, hi: 0x2345 };
    let secret_b = Scalar { lo: 0x3456, hi: 0x4567 };

    let mut pk_a = std::embedded_curve_ops::fixed_base_scalar_mul(secret_a);
    let mut pk_b = std::embedded_curve_ops::fixed_base_scalar_mul(secret_b);

    let address_b = AztecAddress::from_field(pk_b.x);

    // We were lazy in deriving the secret keys, and didn't check the resulting y-coordinates
    // of the pk_a or pk_b to be less than half the field modulus.
    // If needed, we negate the pk's so that they yield valid address points.
    // (We could also have negated the secrets, but there's no negate method for
    // EmbeddedCurvesScalar).
    pk_a = if (AztecAddress::from_field(pk_a.x).to_address_point().unwrap().inner == pk_a) {
        pk_a
    } else {
        pk_a.neg()
    };
    pk_b = if (address_b.to_address_point().unwrap().inner == pk_b) {
        pk_b
    } else {
        pk_b.neg()
    };

    let shared_secret = derive_ecdh_shared_secret_using_aztec_address(secret_a, address_b);
    let shared_secret_alt = derive_ecdh_shared_secret(secret_b, pk_a);

    assert_eq(shared_secret.unwrap(), shared_secret_alt);
}
