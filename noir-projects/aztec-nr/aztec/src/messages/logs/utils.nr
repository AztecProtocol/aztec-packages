use crate::{
    oracle::notes::{get_app_tag_as_sender, increment_app_tagging_secret_index_as_sender},
    prelude::AztecAddress,
};

pub(crate) fn prefix_with_tag<let L: u32>(
    log_without_tag: [Field; L],
    sender: AztecAddress,
    recipient: AztecAddress,
) -> [Field; L + 1] {
    // Safety: we assume that the sender wants for the recipient to find the tagged note, and therefore that they will
    // cooperate and use the correct tag. Usage of a bad tag will result in the recipient not being able to find the
    // note automatically.
    let tag = unsafe { get_app_tag_as_sender(sender, recipient) };
    increment_app_tagging_secret_index_as_sender(sender, recipient);

    let mut log_with_tag = [0; L + 1];

    log_with_tag[0] = tag;
    for i in 0..log_without_tag.len() {
        log_with_tag[i + 1] = log_without_tag[i];
    }

    log_with_tag
}

mod test {
    use super::prefix_with_tag;
    use protocol_types::{
        address::AztecAddress,
        indexed_tagging_secret::IndexedTaggingSecret,
        traits::{Deserialize, FromField},
    };
    use std::test::OracleMock;

    #[test]
    unconstrained fn prefixing_with_tag() {
        let sender = AztecAddress::from_field(1);
        let recipient = AztecAddress::from_field(2);

        let app_tagging_secret = 42;
        let index = 5;

        // I am using the deserialize trait instead of directly instantiating the IndexedTaggingSecret struct because
        // direct instantiation functionality is not exposed.
        let indexed_tagging_secret = IndexedTaggingSecret::deserialize([app_tagging_secret, index]);

        // Mock the tagging oracles
        let _ = OracleMock::mock("getIndexedTaggingSecretAsSender").returns(indexed_tagging_secret);
        let _ = OracleMock::mock("incrementAppTaggingSecretIndexAsSender").returns(());

        let log_without_tag = [1, 2, 3];
        let log_with_tag = prefix_with_tag(log_without_tag, sender, recipient);

        let expected_result = [indexed_tagging_secret.compute_tag(recipient), 1, 2, 3];

        // Check tag was prefixed correctly
        assert_eq(log_with_tag, expected_result, "Tag was not prefixed correctly");
    }
}
