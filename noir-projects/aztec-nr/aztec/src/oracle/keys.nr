use dep::protocol_types::{address::AztecAddress, grumpkin_point::GrumpkinPoint};

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

#[oracle(getAddressMetadata)]
fn get_address_metadata_oracle(
  address: AztecAddress,
) -> [Field; 1] {}

unconstrained fn get_address_metadata_oracle_wrapper(
  address: AztecAddress
) -> [Field; 1] {
  get_address_metadata_oracle(
    address,
  )
}

unconstrained pub fn get_address_metadata(
  address: AztecAddress,
) -> Field {
  let partial_address = get_address_metadata_oracle_wrapper(
    address,
  );

  partial_address[0]
}
