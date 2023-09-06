use crate::types::{
    point::Point,
    grumpkin_scalar::{
        GRUMPKIN_SCALAR_SERIALISED_LEN,
        GrumpkinScalar,
        deserialiseGrumpkinScalar,
    },
};
use crate::oracle::get_public_key::get_public_key;

#[oracle(getSecretKey)]
fn get_secret_key_oracle(_owner: Point) -> [Field; GRUMPKIN_SCALAR_SERIALISED_LEN] {}

unconstrained fn get_secret_key(owner: Field) -> GrumpkinScalar {
    let owner_nullifying_public_key = get_public_key(owner);
    deserialiseGrumpkinScalar(get_secret_key_oracle(owner_nullifying_public_key))
}