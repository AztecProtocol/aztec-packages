use crate::{inbox_rolling_hash::accumulate_inbox_rolling_hash, parity::parity_base::{self, ParityBasePrivateInputs}};
use types::constants::NUM_MSGS_PER_BASE_PARITY;

#[test]
fn public_inputs_match_expected() {
    let mut msgs = [0; NUM_MSGS_PER_BASE_PARITY];
    for i in 0..NUM_MSGS_PER_BASE_PARITY {
        msgs[i] = i as Field;
    }
    let private_inputs = ParityBasePrivateInputs {
        msgs,
        start_rolling_hash: 0,
        num_msgs: NUM_MSGS_PER_BASE_PARITY,
        vk_tree_root: 42,
        prover_id: 7,
    };
    let public_inputs = parity_base::execute(private_inputs);

    let expected_sha_root = 0x279d4d4dd5bcb9b1a4e742640588b917102f9f8bc97a6c95706ca4e7a8a76b;
    let expected_converted_root =
        0x24425e91123ffa26018e970b92316101d503c5937f145d69569ac907d0bd36ec;

    assert_eq(public_inputs.sha_root, expected_sha_root);
    assert_eq(public_inputs.converted_root, expected_converted_root);
    assert_eq(public_inputs.vk_tree_root, 42);
    assert_eq(public_inputs.prover_id, 7);

    // The rolling hash chains all real messages on top of the start value, and the base echoes back its start/count.
    assert_eq(public_inputs.start_rolling_hash, 0);
    assert_eq(public_inputs.num_msgs, NUM_MSGS_PER_BASE_PARITY);
    assert_eq(
        public_inputs.end_rolling_hash,
        accumulate_inbox_rolling_hash(0, msgs, NUM_MSGS_PER_BASE_PARITY),
    );
}

#[test]
fn rolling_hash_ignores_padding_and_threads_start() {
    // Only the first three lanes are real; the rest are zero padding.
    let mut msgs = [0; NUM_MSGS_PER_BASE_PARITY];
    msgs[0] = 11;
    msgs[1] = 22;
    msgs[2] = 33;

    let start = 0x2a;
    let private_inputs = ParityBasePrivateInputs {
        msgs,
        start_rolling_hash: start,
        num_msgs: 3,
        vk_tree_root: 42,
        prover_id: 7,
    };
    let public_inputs = parity_base::execute(private_inputs);

    assert_eq(public_inputs.start_rolling_hash, start);
    assert_eq(public_inputs.num_msgs, 3);
    assert_eq(
        public_inputs.end_rolling_hash,
        accumulate_inbox_rolling_hash(start, [11, 22, 33], 3),
    );
}

#[test(should_fail_with = "Found non-zero field after breakpoint")]
fn non_zero_padding_lane_fails() {
    // Claim two real messages but leave a non-zero value in a padding lane.
    let mut msgs = [0; NUM_MSGS_PER_BASE_PARITY];
    msgs[0] = 11;
    msgs[1] = 22;
    msgs[5] = 999;

    let private_inputs = ParityBasePrivateInputs {
        msgs,
        start_rolling_hash: 0,
        num_msgs: 2,
        vk_tree_root: 42,
        prover_id: 7,
    };
    let _ = parity_base::execute(private_inputs);
}
