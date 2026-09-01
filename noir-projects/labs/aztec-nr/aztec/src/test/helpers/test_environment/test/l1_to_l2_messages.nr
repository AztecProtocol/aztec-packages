use crate::hash::compute_private_content_hash;
use crate::protocol::address::{AztecAddress, EthAddress};
use crate::protocol::traits::FromField;
use crate::test::helpers::test_environment::TestEnvironment;

global PUBLIC_CONTENT_HASH: Field = 0x0a0b0c;
global PRIVATE_CONTENT: [Field; 1] = [0x1234];

#[test]
unconstrained fn consume_seeded_message_from_private_content() {
    let env = TestEnvironment::new();
    let sender = EthAddress::from_field(0xdead);
    let recipient = AztecAddress::from_field(17);

    let leaf_index = env.send_l1_to_l2_message(PUBLIC_CONTENT_HASH, PRIVATE_CONTENT, sender, recipient);

    env.private_context_at(recipient, |context| {
        context.consume_l1_to_l2_message(PUBLIC_CONTENT_HASH, PRIVATE_CONTENT, sender, leaf_index);
    });
}

#[test]
unconstrained fn consume_seeded_message_from_private_content_hash() {
    let env = TestEnvironment::new();
    let sender = EthAddress::from_field(0xbeef);
    let recipient = AztecAddress::from_field(17);

    let private_content_hash = compute_private_content_hash(PRIVATE_CONTENT);
    let leaf_index = env.send_l1_to_l2_message_from_private_content_hash(
        PUBLIC_CONTENT_HASH,
        private_content_hash,
        sender,
        recipient,
    );

    env.private_context_at(recipient, |context| {
        context.consume_l1_to_l2_message(PUBLIC_CONTENT_HASH, PRIVATE_CONTENT, sender, leaf_index);
    });
}

#[test]
unconstrained fn seeding_a_message_mines_a_block() {
    let env = TestEnvironment::new();
    let block_number_before = env.last_block_number();

    let _ = env.send_l1_to_l2_message(
        PUBLIC_CONTENT_HASH,
        PRIVATE_CONTENT,
        EthAddress::from_field(0xdead),
        AztecAddress::from_field(17),
    );

    assert_eq(env.last_block_number(), block_number_before + 1);
}
