use dep::protocol_types::{address::{AztecAddress, PartialAddress, PublicKeysHash}, grumpkin_point::GrumpkinPoint};

#[oracle(getPublicKeysForAddress)]
fn get_public_keys_for_address_oracle(
  address: AztecAddress,
) -> [GrumpkinPoint; 4] {}

unconstrained fn get_public_keys_for_address_oracle_wrapper(
  address: AztecAddress
) -> [GrumpkinPoint; 4] {
  get_public_keys_for_address_oracle(
    address,
  )
}

unconstrained pub fn get_public_keys_for_address(
  address: AztecAddress,
) -> [GrumpkinPoint; 4] {
  let public_keys = get_public_keys_for_address_oracle_wrapper(
    address,
  );

  public_keys
}


#[oracle(getPublicKeysAndPartialAddress)]
fn get_public_keys_and_partial_address_oracle(_address: AztecAddress) -> [Field; 9] {}

unconstrained fn get_public_keys_and_partial_address_oracle_wrapper(address: AztecAddress) -> [Field; 9] {
  get_public_keys_and_partial_address_oracle(address)
}

pub fn get_public_keys_and_partial_address(address: AztecAddress) -> (PartialAddress, [GrumpkinPoint; 4]) {
    let result = get_public_keys_and_partial_address_oracle_wrapper(address);
    let partial_address = PartialAddress::from_field(result[0]);
    let nullifier_pub_key = GrumpkinPoint::new(result[1], result[2]);
    let incoming_pub_key = GrumpkinPoint::new(result[3], result[4]);
    let outgoing_pub_key = GrumpkinPoint::new(result[5], result[6]);
    let tagging_pub_key = GrumpkinPoint::new(result[7], result[8]);

    // TODO(#5830): disabling the following constraint until we update the oracle according to the new key scheme
    // let calculated_address = AztecAddress::compute(PublicKeysHash::compute(pub_key), partial_address);
    // assert(calculated_address.eq(address));

    (partial_address, [nullifier_pub_key, incoming_pub_key, outgoing_pub_key, tagging_pub_key])
}
