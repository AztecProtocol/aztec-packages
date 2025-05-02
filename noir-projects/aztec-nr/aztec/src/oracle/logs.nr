use crate::messages::encoding::MAX_MESSAGE_CONTENT_LEN;
use protocol_types::{abis::event_selector::EventSelector, address::AztecAddress};

/// The below only exists to broadcast the raw log, so we can provide it to the base rollup later to be constrained.
pub unconstrained fn notify_created_contract_class_log<let N: u32>(
    contract_address: AztecAddress,
    message: [Field; N],
    length: u32,
    counter: u32,
) {
    notify_created_contract_class_log_private_oracle(contract_address, message, length, counter)
}

#[oracle(notifyCreatedContractClassLog)]
unconstrained fn notify_created_contract_class_log_private_oracle<let N: u32>(
    contract_address: AztecAddress,
    message: [Field; N],
    length: u32,
    counter: u32,
) {}

pub unconstrained fn store_private_event_log(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    event_selector: EventSelector,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    tx_hash: Field,
    log_index_in_tx: Field,
    tx_index_in_block: Field,
) {
    store_private_event_log_oracle(
        contract_address,
        recipient,
        event_selector,
        msg_content,
        tx_hash,
        log_index_in_tx,
        tx_index_in_block,
    )
}

#[oracle(storePrivateEventLog)]
unconstrained fn store_private_event_log_oracle(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    event_selector: EventSelector,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    tx_hash: Field,
    log_index_in_tx: Field,
    tx_index_in_block: Field,
) {}
