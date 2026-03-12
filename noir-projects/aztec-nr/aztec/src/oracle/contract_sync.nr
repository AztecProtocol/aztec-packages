use crate::protocol::address::AztecAddress;

#[oracle(aztec_utl_invalidateContractSyncCache)]
unconstrained fn invalidate_contract_sync_cache_oracle(contract_address: AztecAddress) {}

/// Forces the PXE to re-sync the given contract on the next query.
///
/// Call this after writing data (e.g. offchain messages) that the contract's `sync_state` function needs to discover.
/// Without invalidation, the sync cache would skip re-running `sync_state` until the next block.
pub unconstrained fn invalidate_contract_sync_cache(contract_address: AztecAddress) {
    invalidate_contract_sync_cache_oracle(contract_address);
}
