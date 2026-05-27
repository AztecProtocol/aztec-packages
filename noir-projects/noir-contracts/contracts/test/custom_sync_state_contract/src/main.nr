// Tests the custom_sync_state AztecConfig option by registering a hook that counts how many times
// sync_state is called and then forwards to do_sync_state.
mod test;

use ::aztec::macros::aztec;
use ::aztec::{
    messages::{
        discovery::{ComputeNoteHash, ComputeNoteNullifier, CustomMessageHandler, do_sync_state},
        processing::offchain::OffchainInboxSync,
    },
    oracle::capsules,
    protocol::{address::AztecAddress, hash::sha256_to_field},
};

global SYNC_COUNTER_SLOT: Field = sha256_to_field("SYNC_COUNTER".as_bytes());

#[aztec(::aztec::macros::AztecConfig::new().custom_sync_state(crate::my_custom_sync))]
contract CustomSyncState {
    use aztec::macros::{functions::{external, initializer}, storage::storage};
    use aztec::messages::message_delivery::MessageDelivery;
    use aztec::protocol::address::AztecAddress;
    use aztec::state_vars::{Owned, PrivateImmutable};
    use field_note::FieldNote;

    #[storage]
    struct Storage<Context> {
        value: Owned<PrivateImmutable<FieldNote, Context>, Context>,
    }

    #[external("private")]
    #[initializer]
    fn constructor(owner: AztecAddress, value: Field) {
        let note = FieldNote { value };
        self.storage.value.at(owner).initialize(note).deliver(MessageDelivery.ONCHAIN_UNCONSTRAINED);
    }

    #[external("utility")]
    unconstrained fn read_value(owner: AztecAddress) -> pub Field {
        self.storage.value.at(owner).view_note().value
    }
}

/// Counts how many times `sync_state` is invoked by incrementing a capsule counter, then forwards
/// to [`do_sync_state`] so that normal note discovery still happens.
unconstrained fn my_custom_sync(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    process_custom_message: Option<CustomMessageHandler>,
    offchain_inbox_sync: Option<OffchainInboxSync>,
    scope: AztecAddress,
) {
    let current: Option<Field> = capsules::load(contract_address, crate::SYNC_COUNTER_SLOT, scope);
    let new_count = current.map(|c| c + 1).unwrap_or(1);
    capsules::store(contract_address, crate::SYNC_COUNTER_SLOT, new_count, scope);
    do_sync_state(
        contract_address,
        compute_note_hash,
        compute_note_nullifier,
        process_custom_message,
        offchain_inbox_sync,
        scope,
    );
}
