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
