//! `#[oracle(...)]` declarations for the fact store.

use crate::ephemeral::EphemeralArray;
use crate::facts::{FactCollection, OriginBlock};
use crate::protocol::address::AztecAddress;

#[oracle(aztec_utl_recordFact)]
pub(crate) unconstrained fn record_fact_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
    fact_type_id: Field,
    payload: EphemeralArray<Field>,
    origin_block: Option<OriginBlock>,
) {}

#[oracle(aztec_utl_deleteFactCollection)]
pub(crate) unconstrained fn delete_fact_collection_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
) {}

#[oracle(aztec_utl_getFactCollection)]
pub(crate) unconstrained fn get_fact_collection_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
) -> Option<FactCollection> {}

#[oracle(aztec_utl_getFactCollectionsByType)]
pub(crate) unconstrained fn get_fact_collections_by_type_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
) -> EphemeralArray<FactCollection> {}
