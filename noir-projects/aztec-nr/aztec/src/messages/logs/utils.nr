use crate::oracle::notes::{get_next_app_tag_as_sender, get_sender_for_tags};
use dep::protocol_types::address::AztecAddress;

// TODO(#14565): Add constrained tagging
pub(crate) fn prefix_with_tag<let L: u32>(
    log_without_tag: [Field; L],
    recipient: AztecAddress,
) -> [Field; L + 1] {
    // Safety: we assume that the sender wants for the recipient to find the tagged note, and therefore that they will
    // cooperate and use the correct tag. Usage of a bad tag will result in the recipient not being able to find the
    // note automatically.
    let tag = unsafe {
        let sender = get_sender_for_tags().expect(
            f"Sender for tags is not set when emitting a private log. Set it by calling `set_sender_for_tags(...)`.",
        );
        get_next_app_tag_as_sender(sender, recipient)
    };

    let mut log_with_tag = [0; L + 1];

    log_with_tag[0] = tag;
    for i in 0..log_without_tag.len() {
        log_with_tag[i + 1] = log_without_tag[i];
    }

    log_with_tag
}

mod test {
    use super::prefix_with_tag;
    use protocol_types::{address::AztecAddress, traits::FromField};
    use std::test::OracleMock;

    #[test(should_fail)]
    unconstrained fn no_tag_sender() {
        let recipient = AztecAddress::from_field(2);

        let expected_tag = 42;

        // Mock the tagging oracles - note privateGetSenderForTags returns none
        let _ = OracleMock::mock("privateGetSenderForTags").returns(Option::<AztecAddress>::none());
        let _ = OracleMock::mock("privateGetNextAppTagAsSender").returns(expected_tag);

        let log_without_tag = [1, 2, 3];
        let _ = prefix_with_tag(log_without_tag, recipient);
    }

    #[test]
    unconstrained fn prefixing_with_tag() {
        let sender = AztecAddress::from_field(1);
        let recipient = AztecAddress::from_field(2);

        let expected_tag = 42;

        // Mock the tagging oracles
        let _ = OracleMock::mock("privateGetSenderForTags").returns(Option::some(sender));
        let _ = OracleMock::mock("privateGetNextAppTagAsSender").returns(expected_tag);

        let log_without_tag = [1, 2, 3];
        let log_with_tag = prefix_with_tag(log_without_tag, recipient);

        let expected_result = [expected_tag, 1, 2, 3];

        // Check tag was prefixed correctly
        assert_eq(log_with_tag, expected_result, "Tag was not prefixed correctly");
    }
}
