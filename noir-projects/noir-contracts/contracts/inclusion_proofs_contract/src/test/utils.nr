use dep::aztec::{
    prelude::AztecAddress, test::helpers::test_environment::TestEnvironment,
};
use crate::InclusionProofs;

pub fn setup() -> (
  &mut TestEnvironment,
  AztecAddress,
  AztecAddress
) {
    let mut env = TestEnvironment::new();
    let account_1 = env.create_account();

    env.impersonate(account_1);
    // Deploy token contract
    let initializer_call_interface = InclusionProofs::interface().constructor(236);

    let inclusion_proofs_contract = env.deploy("./@inclusion_proofs_contract", "InclusionProofs").with_public_initializer(initializer_call_interface);
    let inclusion_proofs_contract_address = inclusion_proofs_contract.to_address();
    env.advance_block_by(1);

    (
      &mut env,
      inclusion_proofs_contract_address,
      account_1
    )
}
