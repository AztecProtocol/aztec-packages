use crate::{ephemeral::EphemeralArray, protocol::{address::AztecAddress, traits::{Deserialize, Serialize}}};

/// A single fact about an entity: its type id, plus a payload carried in its own ephemeral array.
///
/// `payload` is a nested [`EphemeralArray`] so a fact can carry any number of fields without a fixed maximum.
#[derive(Serialize, Deserialize)]
pub struct Fact {
    pub fact_type_id: Field,
    pub payload: EphemeralArray<Field>,
}

/// An entity's stored state: its own payload, plus the set of facts recorded against it.
///
/// Both fields are nested [`EphemeralArray`]s so an entity can carry an arbitrary-length payload and any number of
/// facts without a fixed maximum.
#[derive(Serialize, Deserialize)]
pub struct Entity {
    pub payload: EphemeralArray<Field>,
    pub facts: EphemeralArray<Fact>,
}

// Oracle declarations

#[oracle(aztec_utl_recordRetractableFact)]
unconstrained fn record_retractable_fact_oracle<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
    fact_type_id: Field,
    payload: [Field; N],
    block_number: u32,
    block_hash: Field,
) {}

#[oracle(aztec_utl_recordNonRetractableFact)]
unconstrained fn record_non_retractable_fact_oracle<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
    fact_type_id: Field,
    payload: [Field; N],
) {}

#[oracle(aztec_utl_createRetractableEntity)]
unconstrained fn create_retractable_entity_oracle<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
    payload: [Field; N],
    block_number: u32,
    block_hash: Field,
) {}

#[oracle(aztec_utl_createNonRetractableEntity)]
unconstrained fn create_non_retractable_entity_oracle<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
    payload: [Field; N],
) {}

#[oracle(aztec_utl_activeEntities)]
unconstrained fn active_entities_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
) -> EphemeralArray<Field> {}

#[oracle(aztec_utl_getEntity)]
unconstrained fn get_entity_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
) -> Entity {}

#[oracle(aztec_utl_terminateEntity)]
unconstrained fn terminate_entity_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
) {}

// Public wrappers

/// Records a retractable fact for an entity.
///
/// Retractable facts are tied to a block anchor (`block_number`, `block_hash`) and are pruned from the store if
/// that block is reorg'd away.
pub unconstrained fn record_retractable_fact<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
    fact_type_id: Field,
    payload: [Field; N],
    block_number: u32,
    block_hash: Field,
) {
    record_retractable_fact_oracle(
        contract_address,
        scope,
        entity_type_id,
        correlation_key,
        fact_type_id,
        payload,
        block_number,
        block_hash,
    );
}

/// Records a non-retractable (permanent) fact for an entity.
///
/// Non-retractable facts survive reorgs and are never pruned by the store.
pub unconstrained fn record_non_retractable_fact<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
    fact_type_id: Field,
    payload: [Field; N],
) {
    record_non_retractable_fact_oracle(
        contract_address,
        scope,
        entity_type_id,
        correlation_key,
        fact_type_id,
        payload,
    );
}

/// Creates a retractable entity with the given payload.
///
/// Retractable entities are tied to a block anchor (`block_number`, `block_hash`); if that block is reorg'd away the
/// entire entity - its payload and every fact recorded against it - is pruned from the store.
pub unconstrained fn create_retractable_entity<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
    payload: [Field; N],
    block_number: u32,
    block_hash: Field,
) {
    create_retractable_entity_oracle(
        contract_address,
        scope,
        entity_type_id,
        correlation_key,
        payload,
        block_number,
        block_hash,
    );
}

/// Creates a non-retractable (permanent) entity with the given payload.
///
/// Non-retractable entities survive reorgs; only their own retractable facts are pruned.
pub unconstrained fn create_non_retractable_entity<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
    payload: [Field; N],
) {
    create_non_retractable_entity_oracle(
        contract_address,
        scope,
        entity_type_id,
        correlation_key,
        payload,
    );
}

/// Returns the correlation keys of all currently active entities of the given type.
pub unconstrained fn active_entities(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
) -> EphemeralArray<Field> {
    active_entities_oracle(contract_address, scope, entity_type_id)
}

/// Returns the given entity: its payload together with its fact set.
pub unconstrained fn get_entity(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
) -> Entity {
    get_entity_oracle(contract_address, scope, entity_type_id, correlation_key)
}

/// Marks an entity as terminated, preventing new facts from being recorded for it.
pub unconstrained fn terminate_entity(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
) {
    terminate_entity_oracle(contract_address, scope, entity_type_id, correlation_key);
}
