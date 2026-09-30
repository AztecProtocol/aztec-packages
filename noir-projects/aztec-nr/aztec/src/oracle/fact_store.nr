//! `#[oracle(...)]` declarations for the fact store.

use crate::ephemeral::EphemeralArray;
use crate::facts::{FactCollection, FactScope};
use crate::oracle::block_reference::BlockReference;
use crate::protocol::address::AztecAddress;

#[oracle(aztec_utl_recordFactV2)]
pub(crate) unconstrained fn record_fact_oracle(
    contract_address: AztecAddress,
    scope: FactScope,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
    fact_type_id: Field,
    payload: EphemeralArray<Field>,
    origin_block: Option<BlockReference>,
) {}

#[oracle(aztec_utl_deleteFactCollectionV2)]
pub(crate) unconstrained fn delete_fact_collection_oracle(
    contract_address: AztecAddress,
    scope: FactScope,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
) {}

#[oracle(aztec_utl_getFactCollectionV2)]
pub(crate) unconstrained fn get_fact_collection_oracle(
    contract_address: AztecAddress,
    scope: FactScope,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
) -> Option<FactCollection> {}

#[oracle(aztec_utl_getFactCollectionsByTypeV2)]
pub(crate) unconstrained fn get_fact_collections_by_type_oracle(
    contract_address: AztecAddress,
    scope: FactScope,
    fact_collection_type_id: Field,
) -> EphemeralArray<FactCollection> {}
