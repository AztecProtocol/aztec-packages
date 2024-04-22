use dep::protocol_types::address::AztecAddress;

#[oracle(getPublicKeysForAddress)]
fn get_public_keys_for_address_oracle(
  address: AztecAddress,
) -> [Field; 4] {}

unconstrained fn get_public_keys_for_address_oracle_wrapper(
  address: AztecAddress
) -> [Field; 4] {
  get_public_keys_for_address_oracle(
    address,
  )
}

unconstrained pub fn get_public_keys_for_address(
  address: AztecAddress,
) -> [Field; 4] {
  let public_keys = get_public_keys_for_address_oracle_wrapper(
    address,
  );

  public_keys
}
