use crate::base::parity_base_private_inputs::ParityBasePrivateInputs;
use types::constants::NUM_MSGS_PER_BASE_PARITY;

#[test]
fn public_inputs_match_expected() {
    let mut msgs = [0; NUM_MSGS_PER_BASE_PARITY];
    for i in 0..NUM_MSGS_PER_BASE_PARITY {
        msgs[i] = i as Field;
    }
    let private_inputs = ParityBasePrivateInputs { msgs, vk_tree_root: 42 };
    let public_inputs = private_inputs.execute();

    let expected_sha_root = 0x279d4d4dd5bcb9b1a4e742640588b917102f9f8bc97a6c95706ca4e7a8a76b;
    let expected_converted_root =
        0x1965a8ce8f0324a6c879d4db3a4354293fcc961c337d7e10c1f65ecaaf3bf613;

    assert_eq(public_inputs.sha_root, expected_sha_root);
    assert_eq(public_inputs.converted_root, expected_converted_root);
    assert_eq(public_inputs.vk_tree_root, 42);
}
