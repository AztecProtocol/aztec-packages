//! `#[oracle(...)]` declarations for the entity store.

use crate::entities::{OriginBlock, RawEntity};
use crate::ephemeral::EphemeralArray;
use crate::protocol::address::AztecAddress;

#[oracle(aztec_utl_createEntity)]
pub(crate) unconstrained fn create_entity_oracle<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
    body: [Field; N],
    origin_block: Option<OriginBlock>,
) {}

#[oracle(aztec_utl_recordFact)]
pub(crate) unconstrained fn record_fact_oracle<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
    fact_type_id: Field,
    payload: [Field; N],
    origin_block: Option<OriginBlock>,
) {}

#[oracle(aztec_utl_getEntities)]
pub(crate) unconstrained fn get_entities_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
) -> EphemeralArray<RawEntity> {}

#[oracle(aztec_utl_getEntity)]
pub(crate) unconstrained fn get_entity_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
) -> RawEntity {}

#[oracle(aztec_utl_terminateEntity)]
pub(crate) unconstrained fn terminate_entity_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
) {}
