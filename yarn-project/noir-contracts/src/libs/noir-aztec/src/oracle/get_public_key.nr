use crate::types::point::Point;

#[oracle(getPublicKey)]
fn get_public_key_oracle(_address: Field) -> [Field; 3] {}

unconstrained fn get_public_key_internal(address: Field) -> [Field; 3] {
  get_public_key_oracle(address)
}

fn get_public_key(address: Field) -> Point {
  let result = get_public_key_internal(address);
  let pub_key_x = result[0];
  let pub_key_y = result[1];
  let _partial_address = result[2];
  
  // TODO: Constrain address = hash(pub_key, partial_address)
  
  Point::new(pub_key_x, pub_key_y)
}