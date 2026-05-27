use crate::protocol::address::AztecAddress;

/// Maximum number of `Field`s in a single fact payload.
///
/// The largest payload today is the offchain `Received` fact: ciphertext (15) + length (1) + tx hash (1) +
/// timestamp (1) = 18 fields. We round up to 20 to leave headroom for future fact shapes.
pub global FACT_MAX_PAYLOAD: u32 = 20;

/// Maximum number of facts that [`load_canonical_facts`] returns for a single entity.
pub global FACT_MAX_FACTS: u32 = 8;

/// Maximum number of active entity correlation keys that [`active_entities`] returns.
pub global FACT_MAX_ACTIVE_ENTITIES: u32 = 64;

/// A single canonical fact, as returned by [`load_canonical_facts`].
///
/// `payload` is zero-padded to [`FACT_MAX_PAYLOAD`]; the consumer is responsible for knowing how many fields are
/// meaningful for a given `fact_type_id`.
pub struct PackedFact {
    pub fact_type_id: Field,
    pub payload: [Field; FACT_MAX_PAYLOAD],
}

/// Records a fact about an entity in the contract's per-scope fact store.
///
/// `anchor` is optional: when `has_anchor` is `false`, the fact is recorded without a block anchor and the
/// `anchor_block_number` / `anchor_block_hash` arguments are ignored.
pub unconstrained fn record_fact(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
    fact_type: Field,
    correlation_key: Field,
    payload: [Field; FACT_MAX_PAYLOAD],
    has_anchor: bool,
    anchor_block_number: Field,
    anchor_block_hash: Field,
) {
    record_fact_oracle(
        contract_address,
        scope,
        entity_type,
        fact_type,
        correlation_key,
        payload,
        has_anchor as Field,
        anchor_block_number,
        anchor_block_hash,
    );
}

/// Returns the correlation keys of the entities of a given type that are currently active (i.e. recorded and not
/// terminated) in the contract's per-scope fact store.
pub unconstrained fn active_entities(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
) -> BoundedVec<Field, FACT_MAX_ACTIVE_ENTITIES> {
    let (keys, len) = active_entities_oracle(contract_address, scope, entity_type);
    BoundedVec::from_parts(keys, len)
}

/// Returns the canonical set of facts recorded for a single entity, identified by its `entity_type` and
/// `correlation_key`. Empty trailing slots are zeroed [`PackedFact`]s.
pub unconstrained fn load_canonical_facts(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
    correlation_key: Field,
) -> [PackedFact; FACT_MAX_FACTS] {
    load_canonical_facts_oracle(contract_address, scope, entity_type, correlation_key)
}

/// Terminates an entity, removing it from the active set returned by [`active_entities`].
pub unconstrained fn terminate_entity(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
    correlation_key: Field,
) {
    terminate_entity_oracle(contract_address, scope, entity_type, correlation_key);
}

#[oracle(aztec_utl_recordFact)]
unconstrained fn record_fact_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
    fact_type: Field,
    correlation_key: Field,
    payload: [Field; FACT_MAX_PAYLOAD],
    has_anchor: Field,
    anchor_block_number: Field,
    anchor_block_hash: Field,
) {}

#[oracle(aztec_utl_activeEntities)]
unconstrained fn active_entities_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
) -> ([Field; FACT_MAX_ACTIVE_ENTITIES], u32) {}

#[oracle(aztec_utl_loadCanonicalFacts)]
unconstrained fn load_canonical_facts_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
    correlation_key: Field,
) -> [PackedFact; FACT_MAX_FACTS] {}

#[oracle(aztec_utl_terminateEntity)]
unconstrained fn terminate_entity_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
    correlation_key: Field,
) {}
