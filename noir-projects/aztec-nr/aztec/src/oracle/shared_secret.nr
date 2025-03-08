use dep::protocol_types::{
    address::aztec_address::AztecAddress,
    point::{Point, POINT_LENGTH},
    traits::Deserialize,
};

// TODO(benesjan): When I directly returned Point from the oracle, I got an error with num destination slots.
// Does the reviewer know why it didn't work?
#[oracle(getSharedSecret)]
pub unconstrained fn get_shared_secret_oracle(
    address: AztecAddress,
    ephPk: Point,
) -> [Field; POINT_LENGTH] {}

pub unconstrained fn get_shared_secret(address: AztecAddress, ephPk: Point) -> Point {
    let fields = get_shared_secret_oracle(address, ephPk);
    Point::deserialize(fields)
}
