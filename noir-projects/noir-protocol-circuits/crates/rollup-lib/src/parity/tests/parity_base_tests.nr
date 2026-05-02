use crate::parity::parity_base::{self, ParityBasePrivateInputs};
use types::constants::NUM_MSGS_PER_BASE_PARITY;

#[test]
fn public_inputs_match_expected() {
    let mut msgs = [0; NUM_MSGS_PER_BASE_PARITY];
    for i in 0..NUM_MSGS_PER_BASE_PARITY {
        msgs[i] = i as Field;
    }
    let private_inputs = ParityBasePrivateInputs { msgs, vk_tree_root: 42, prover_id: 7 };
    let public_inputs = parity_base::execute(private_inputs);

    let expected_sha_root = 0x279d4d4dd5bcb9b1a4e742640588b917102f9f8bc97a6c95706ca4e7a8a76b;
    let expected_converted_root =
        0x24425e91123ffa26018e970b92316101d503c5937f145d69569ac907d0bd36ec;

    assert_eq(public_inputs.sha_root, expected_sha_root);
    assert_eq(public_inputs.converted_root, expected_converted_root);
    assert_eq(public_inputs.vk_tree_root, 42);
    assert_eq(public_inputs.prover_id, 7);
}
