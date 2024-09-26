use crate::test::utils;
use crate::InclusionProofs;

#[test]
unconstrained fn shared_immutable() {
  let (env,
    inclusion_proofs_contract_address,
    account_1
  ) = utils::setup();
  env.impersonate(account_1);

  let note_creation_block_number = 10;

  env.advance_block_to(note_creation_block_number - 1);
  env.call_private_void(InclusionProofs::at(inclusion_proofs_contract_address).create_note(account_1, 100));
  env.advance_block_by(5);

  // owner: AztecAddress,
  // use_block_number: bool,
  // block_number: u32, // The block at which we'll prove that the note exists
  // nullified: bool
  env.call_private_void(InclusionProofs::at(inclusion_proofs_contract_address).test_note_inclusion(account_1, true, note_creation_block_number, false));
  // env.call_private_void(InclusionProofs::at(inclusion_proofs_contract_address).test_note_inclusion(account_1, false, 0, false));

}
