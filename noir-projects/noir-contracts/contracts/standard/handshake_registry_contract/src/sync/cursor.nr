use crate::sync::rewindable_register::RewindableRegister;
use aztec::{
    facts::{delete_fact_collection, OriginBlock},
    protocol::{abis::block_header::BlockHeader, address::AztecAddress, hash::sha256_to_field, traits::Hash},
};

/// Fact-collection type id of the per-recipient sync cursor: a [`RewindableRegister`] holding the anchor block of
/// the last completed scan.
global SYNC_CURSOR_TYPE_ID: Field = sha256_to_field("HANDSHAKE_REGISTRY::SYNC_CURSOR".as_bytes());

/// Collection id of the singleton cursor register.
global SYNC_CURSOR_COLLECTION_ID: Field = 0;

/// Reorg-aware cursor tracking the last scanned anchor block of a recipient's handshake sync.
pub(crate) struct SyncCursor {
    contract_address: AztecAddress,
    scope: AztecAddress,
}

impl SyncCursor {
    /// Returns the cursor of `scope`'s handshake sync in the given contract.
    pub(crate) unconstrained fn at(contract_address: AztecAddress, scope: AztecAddress) -> Self {
        Self { contract_address, scope }
    }

    /// Returns the first block the next scan must cover, or `None` to scan from genesis.
    ///
    /// The next scan starts one past the last completed scan's anchor block. `None` means no scan ever completed, or
    /// a reorg rolled back every recorded one.
    pub(crate) unconstrained fn next_block_to_scan(self) -> Option<u32> {
        self.register().read().map(|anchor| anchor + 1)
    }

    /// Records a completed scan up to the given anchor block.
    ///
    /// The cursor originates at the scanned anchor block itself, so a reorg pruning that block rolls the cursor back
    /// to the last surviving scan and the pruned range gets covered again.
    pub(crate) unconstrained fn advance(self, anchor_block_header: BlockHeader) {
        self.register().write(
            anchor_block_header.block_number(),
            OriginBlock { block_number: anchor_block_header.block_number(), block_hash: anchor_block_header.hash() },
        );
    }

    /// Forgets every recorded scan, as if no sync had ever completed. Only used by tests, to emulate a reorg
    /// retracting every recorded scan.
    pub(crate) unconstrained fn clear(self) {
        delete_fact_collection(
            self.contract_address,
            self.scope,
            SYNC_CURSOR_TYPE_ID,
            SYNC_CURSOR_COLLECTION_ID,
        );
    }

    unconstrained fn register(self) -> RewindableRegister<u32> {
        RewindableRegister::at(
            self.contract_address,
            self.scope,
            SYNC_CURSOR_TYPE_ID,
            SYNC_CURSOR_COLLECTION_ID,
        )
    }
}
