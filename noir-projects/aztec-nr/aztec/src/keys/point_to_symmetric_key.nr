use dep::protocol_types::{grumpkin_point::GrumpkinPoint, grumpkin_private_key::GrumpkinPrivateKey};
use dep::std::hash::sha256;

pub fn point_to_symmetric_key(secret: GrumpkinPrivateKey, point: GrumpkinPoint) -> [u8; 32] {
    // let shared_secret = secret * point; // TODO(benesjan): implement grumpkin_scalar_mul::grumpkin_variable_base
    let shared_secret = point;
    sha256(shared_secret.to_be_bytes())
}

#[test]
fn check_point_to_symmetric_key() {
    let secret = GrumpkinPrivateKey::new(5, 6);
    let point = GrumpkinPoint::new(7, 8);

    let key = point_to_symmetric_key(secret, point);
    assert(key == [
        0x6c, 0x2e, 0x7d, 0x5b, 0x3a, 0x2d, 0x96, 0x4c, 0x1f, 0x0f, 0x4b, 0x40, 0x7b, 0x3e, 0x3b, 0x47,
        0x77, 0x55, 0x1f, 0x8d, 0x8c, 0x7f, 0x9e, 0x0d, 0x3e, 0x4e, 0x12, 0x0b, 0x8a, 0x9c, 0x9b, 0x8d
    ]);
}