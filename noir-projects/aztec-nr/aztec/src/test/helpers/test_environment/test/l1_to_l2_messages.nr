use crate::hash::compute_secret_hash;
use crate::protocol::address::{AztecAddress, EthAddress};
use crate::protocol::traits::FromField;
use crate::test::helpers::test_environment::TestEnvironment;

global CONTENT: Field = 0x0a0b0c;
global SECRET: Field = 0x1234;

#[test]
unconstrained fn consume_seeded_message_from_secret() {
    let env = TestEnvironment::new();
    let sender = EthAddress::from_field(0xdead);
    let recipient = AztecAddress::from_field(17);

    let leaf_index = env.send_l1_to_l2_message(CONTENT, SECRET, sender, recipient);

    env.private_context_at(recipient, |context| {
        context.consume_l1_to_l2_message(CONTENT, SECRET, sender, leaf_index);
    });
}

#[test]
unconstrained fn consume_seeded_message_from_secret_hash() {
    let env = TestEnvironment::new();
    let sender = EthAddress::from_field(0xbeef);
    let recipient = AztecAddress::from_field(17);

    let leaf_index =
        env.send_l1_to_l2_message_from_secret_hash(CONTENT, compute_secret_hash(SECRET), sender, recipient);

    env.private_context_at(recipient, |context| {
        context.consume_l1_to_l2_message(CONTENT, SECRET, sender, leaf_index);
    });
}

#[test]
unconstrained fn seeding_a_message_mines_a_block() {
    let env = TestEnvironment::new();
    let block_number_before = env.last_block_number();

    let _ = env.send_l1_to_l2_message(CONTENT, SECRET, EthAddress::from_field(0xdead), AztecAddress::from_field(17));

    assert_eq(env.last_block_number(), block_number_before + 1);
}
