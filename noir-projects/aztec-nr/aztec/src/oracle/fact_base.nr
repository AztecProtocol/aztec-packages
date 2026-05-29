use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}};

/// Maximum number of `Field`s in a single fact payload.
///
/// The largest payload today is the offchain `Received` fact: ciphertext (15) + length (1) + tx hash (1) +
/// timestamp (1) = 18 fields. We round up to 20 to leave headroom for future fact shapes.
pub global FACT_MAX_PAYLOAD: u32 = 20;

/// Maximum number of facts that [`get_entity_facts`] returns for a single entity.
pub global FACT_MAX_FACTS: u32 = 8;

/// Maximum number of active entity correlation keys that [`active_entities`] returns.
pub global FACT_MAX_ACTIVE_ENTITIES: u32 = 64;

/// A single canonical fact, as returned by [`get_entity_facts`].
///
/// `payload` is zero-padded to [`FACT_MAX_PAYLOAD`]; the consumer is responsible for knowing how many fields are
/// meaningful for a given `fact_type_id`.
pub struct PackedFact {
    pub fact_type_id: Field,
    pub payload: [Field; FACT_MAX_PAYLOAD],
}

/// Records a retractable fact: its existence is tied to the L2 block it originated from.
///
/// The fact exists only while that origin block stays canonical, so a reorg that orphans the origin block retracts
/// the fact from [`get_entity_facts`].
pub unconstrained fn record_retractable_fact(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
    fact_type: Field,
    correlation_key: Field,
    payload: [Field; FACT_MAX_PAYLOAD],
    origin_block_number: Field,
    origin_block_hash: Field,
) {
    record_fact_oracle(
        contract_address,
        scope,
        entity_type,
        fact_type,
        correlation_key,
        payload,
        1,
        origin_block_number,
        origin_block_hash,
    );
}

/// Records a non-retractable fact: it has no origin block, so it exists for the lifetime of its entity,
/// regardless of any subsequent reorgs.
pub unconstrained fn record_non_retractable_fact(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
    fact_type: Field,
    correlation_key: Field,
    payload: [Field; FACT_MAX_PAYLOAD],
) {
    record_fact_oracle(
        contract_address,
        scope,
        entity_type,
        fact_type,
        correlation_key,
        payload,
        0,
        0,
        0,
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
pub unconstrained fn get_entity_facts(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
    correlation_key: Field,
) -> [PackedFact; FACT_MAX_FACTS] {
    get_entity_facts_oracle(contract_address, scope, entity_type, correlation_key)
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

/// Packs a `Serialize` value into the fixed-size [`FACT_MAX_PAYLOAD`] field array used as a fact payload.
///
/// The value's serialized form is copied into the leading `N` slots; remaining slots are zero-padded. The
/// `Serialize<N = N>` bound ties the generic `N` to the trait's associated length, so callers cannot under- or
/// over-specify it. `N <= FACT_MAX_PAYLOAD` is enforced at compile time by the payload-write indexing.
pub unconstrained fn pack_fact_payload<T, let N: u32>(value: T) -> [Field; FACT_MAX_PAYLOAD]
where
    T: Serialize<N = N>,
{
    let serialized = value.serialize();
    let mut payload: [Field; FACT_MAX_PAYLOAD] = [0; FACT_MAX_PAYLOAD];
    for i in 0..N {
        payload[i] = serialized[i];
    }
    payload
}

/// Inverse of [`pack_fact_payload`]: decodes the leading `N` fields of a fact payload back into a `Deserialize`
/// value. The `Deserialize<N = N>` bound ties the generic `N` to the trait's associated length.
pub unconstrained fn unpack_fact_payload<T, let N: u32>(payload: [Field; FACT_MAX_PAYLOAD]) -> T
where
    T: Deserialize<N = N>,
{
    let mut serialized: [Field; N] = [0; N];
    for i in 0..N {
        serialized[i] = payload[i];
    }
    T::deserialize(serialized)
}

#[oracle(aztec_utl_recordFact)]
unconstrained fn record_fact_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
    fact_type: Field,
    correlation_key: Field,
    payload: [Field; FACT_MAX_PAYLOAD],
    has_origin: Field,
    origin_block_number: Field,
    origin_block_hash: Field,
) {}

#[oracle(aztec_utl_activeEntities)]
unconstrained fn active_entities_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type: Field,
) -> ([Field; FACT_MAX_ACTIVE_ENTITIES], u32) {}

#[oracle(aztec_utl_loadCanonicalFacts)]
unconstrained fn get_entity_facts_oracle(
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
