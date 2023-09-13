use crate::types::point::Point;
use crate::oracle::get_public_key::get_public_key;

#[oracle(getSecretKey)]
fn get_secret_key_oracle(_owner: Point) -> [Field; dep::std::grumpkin_scalar::GRUMPKIN_SCALAR_SERIALISED_LEN] {}

unconstrained fn get_secret_key(owner: Field) -> dep::std::grumpkin_scalar::GrumpkinScalar {
    let owner_nullifying_public_key = get_public_key(owner);
    dep::std::grumpkin_scalar::deserialise_grumpkin_scalar(get_secret_key_oracle(owner_nullifying_public_key))
}