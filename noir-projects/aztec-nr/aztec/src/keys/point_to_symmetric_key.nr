use dep::protocol_types::{constants::GENERATOR_INDEX__SYMMETRIC_KEY, grumpkin_point::GrumpkinPoint, utils::arr_copy_slice};
use dep::std::{hash::sha256, grumpkin_scalar::GrumpkinScalar, grumpkin_scalar_mul::grumpkin_variable_base};

pub fn point_to_symmetric_key(secret: GrumpkinScalar, point: GrumpkinPoint) -> [u8; 32] {
    let shared_secret_fields = grumpkin_variable_base(point.x, point.y, secret);
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/6061): make the func return Point struct directly
    let shared_secret = GrumpkinPoint::new(shared_secret_fields[0], shared_secret_fields[1]);
    let mut shared_secret_bytes_with_separator = [0 as u8; 65];
    shared_secret_bytes_with_separator = arr_copy_slice(shared_secret.to_be_bytes(), shared_secret_bytes_with_separator, 0);
    shared_secret_bytes_with_separator[64] = GENERATOR_INDEX__SYMMETRIC_KEY;
    sha256(shared_secret_bytes_with_separator)
}

#[test]
fn check_point_to_symmetric_key() {
    let secret = GrumpkinScalar::new(
        0x00000000000000000000000000000000649e7ca01d9de27b21624098b897babd,
        0x0000000000000000000000000000000023b3127c127b1f29a7adff5cccf8fb06
    );
    let point = GrumpkinPoint::new(
        0x2688431c705a5ff3e6c6f2573c9e3ba1c1026d2251d0dbbf2d810aa53fd1d186,
        0x1e96887b117afca01c00468264f4f80b5bb16d94c1808a448595f115556e5c8e
    );

    let key = point_to_symmetric_key(secret, point);
    let expected_key = [25,176,196,77,91,235,218,204,186,157,195,137,205,53,141,10,90,174,222,204,191,49,246,123,99,87,121,67,99,117,50,29];
    assert_eq(key, expected_key);
}
