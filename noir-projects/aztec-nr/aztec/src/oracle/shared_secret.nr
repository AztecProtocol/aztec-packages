use dep::protocol_types::{
    address::aztec_address::AztecAddress,
    point::{Point, POINT_LENGTH},
    traits::Deserialize,
};

// TODO(#12656): return an app-siloed secret + document this
#[oracle(getSharedSecret)]
pub unconstrained fn get_shared_secret_oracle(
    address: AztecAddress,
    ephPk: Point,
) -> [Field; POINT_LENGTH] {}

pub unconstrained fn get_shared_secret(address: AztecAddress, ephPk: Point) -> Point {
    let fields = get_shared_secret_oracle(address, ephPk);
    Point::deserialize(fields)
}
