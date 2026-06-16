use crate::messages::delivery::MessageDelivery;
use crate::oracle::{notes::{get_app_tagging_secret, get_next_tagging_index, get_sender_for_tags}, random::random};
use crate::protocol::{address::AztecAddress, hash::poseidon2_hash};

// TODO(#14565): Add constrained tagging
/// Returns the next discovery tag for a private log sent to `recipient`.
///
/// Private logs are encrypted, so the recipient cannot tell which logs are meant for it just by looking at them.
/// To solve this, sender and recipient derive a shared secret from their keys, and from that secret they produce a
/// sequence of one-time tags (tag_0, tag_1, ...). The recipient scans for these tags because it can compute the same
/// sequence. This function returns the next raw (not domain-separated) tag in the sequence.
pub(crate) fn compute_discovery_tag(recipient: AztecAddress, sender_override: Option<AztecAddress>) -> Field {
    // Safety: we assume that the sender wants for the recipient to find the tagged note, and therefore that they will
    // cooperate and use the correct tag. Usage of a bad tag will result in the recipient not being able to find the
    // note automatically.
    unsafe {
        let sender = sender_override.unwrap_or_else(|| {
            get_sender_for_tags().expect(
                f"Sender for tags is not set when emitting a private log and no override is set. Ensure the wallet provides a default sender.",
            )
        });
        get_app_tagging_secret(sender, recipient).map_or_else(
            || {
                // The oracle returns `None` for invalid recipients. To prevent king-of-the-hill attacks, emit a random
                // tag instead of failing: the log shape is preserved, even though no recipient can discover the note.
                random()
            },
            |secret| {
                let index = get_next_tagging_index(secret, MessageDelivery::onchain_unconstrained());
                poseidon2_hash([secret, index as Field])
            },
        )
    }
}

mod test {
    use crate::protocol::{address::AztecAddress, hash::poseidon2_hash, traits::FromField};
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::compute_discovery_tag;
    use std::test::OracleMock;

    #[test(should_fail_with = "Sender for tags is not set")]
    unconstrained fn no_tag_sender() {
        let recipient = AztecAddress::from_field(2);
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::<AztecAddress>::none());
        let _ = compute_discovery_tag(recipient, Option::none());
    }

    #[test]
    unconstrained fn computes_tag_from_secret_and_index() {
        let sender = AztecAddress::from_field(1);
        let recipient = AztecAddress::from_field(2);
        let secret: Field = 7;
        let index: u32 = 3;
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::some(sender));
        let _ = OracleMock::mock("aztec_prv_getAppTaggingSecret").returns(Option::some(secret));
        let _ = OracleMock::mock("aztec_prv_getNextTaggingIndex").returns(index);
        assert_eq(compute_discovery_tag(recipient, Option::none()), poseidon2_hash([secret, index as Field]));
    }

    #[test]
    unconstrained fn uses_random_tag_for_invalid_recipient() {
        let sender = AztecAddress::from_field(1);
        let recipient = AztecAddress::from_field(2);
        let random_tag = 42;
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::some(sender));
        let _ = OracleMock::mock("aztec_prv_getAppTaggingSecret").returns(Option::<Field>::none());
        let _ = OracleMock::mock("aztec_misc_getRandomField").returns(random_tag);
        assert_eq(compute_discovery_tag(recipient, Option::none()), random_tag);
    }

    #[test]
    unconstrained fn does_not_fail_on_an_invalid_recipient() {
        let mut env = TestEnvironment::new();

        let sender = env.create_light_account();

        env.private_context(|_context| {
            // The recipient is an invalid address
            let recipient = AztecAddress { inner: 3 };
            assert(!recipient.is_valid());

            let _ = compute_discovery_tag(recipient, Option::some(sender));
        });
    }
}
