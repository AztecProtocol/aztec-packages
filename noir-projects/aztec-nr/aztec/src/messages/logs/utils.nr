use crate::oracle::notes::{get_next_app_tag_as_sender, get_sender_for_tags};
use crate::protocol::address::AztecAddress;

// TODO(#14565): Add constrained tagging
/// Returns the next discovery tag for a private log sent to `recipient`.
///
/// Private logs are encrypted, so the recipient cannot tell which logs are meant for it just by looking at them.
/// To solve this, sender and recipient derive a shared secret from their keys, and from that secret they produce a
/// sequence of one-time tags (tag_0, tag_1, ...). The recipient scans for these tags because it can compute the same
/// sequence. This function returns the next raw (not domain-separated) tag in the sequence.
pub(crate) fn compute_discovery_tag(recipient: AztecAddress) -> Field {
    // Safety: we assume that the sender wants for the recipient to find the tagged note, and therefore that they will
    // cooperate and use the correct tag. Usage of a bad tag will result in the recipient not being able to find the
    // note automatically.
    unsafe {
        let sender = get_sender_for_tags().expect(
            f"Sender for tags is not set when emitting a private log. Set it by calling `set_sender_for_tags(...)`.",
        );
        get_next_app_tag_as_sender(sender, recipient)
    }
}

mod test {
    use crate::oracle::notes::set_sender_for_tags;
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::compute_discovery_tag;
    use std::test::OracleMock;

    #[test(should_fail_with = "Sender for tags is not set")]
    unconstrained fn no_tag_sender() {
        let recipient = AztecAddress::from_field(2);
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::<AztecAddress>::none());
        let _ = OracleMock::mock("aztec_prv_getNextAppTagAsSender").returns(42);
        let _ = compute_discovery_tag(recipient);
    }

    #[test]
    unconstrained fn returns_oracle_tag() {
        let sender = AztecAddress::from_field(1);
        let recipient = AztecAddress::from_field(2);
        let expected_tag = 42;
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::some(sender));
        let _ = OracleMock::mock("aztec_prv_getNextAppTagAsSender").returns(expected_tag);
        assert_eq(compute_discovery_tag(recipient), expected_tag);
    }

    #[test]
    unconstrained fn does_not_fail_on_an_invalid_recipient() {
        let mut env = TestEnvironment::new();

        let sender = env.create_light_account();

        env.private_context(|_context| {
            set_sender_for_tags(sender);

            // The recipient is an invalid address
            let recipient = AztecAddress { inner: 3 };
            assert(!recipient.is_valid());

            let _ = compute_discovery_tag(recipient);
        });
    }
}
