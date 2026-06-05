use crate::protocol::address::AztecAddress;

// Maximum number of Field elements in a single fact's payload.
pub global FACT_MAX_PAYLOAD: u32 = 20;

// Maximum number of facts that can be stored per entity.
pub global FACT_MAX_FACTS: u32 = 8;

// Maximum number of active entities that can be returned by `active_entities`.
pub global FACT_MAX_ACTIVE_ENTITIES: u32 = 64;

// Flat-array bound for a packed fact set returned by `aztec_utl_getEntityFacts`:
//   1 (count) + FACT_MAX_FACTS * (1 factTypeId + 1 payloadLen + FACT_MAX_PAYLOAD payload fields).
global FACT_SET_MAX_FIELDS: u32 = 1 + FACT_MAX_FACTS * (2 + FACT_MAX_PAYLOAD);

// Flat-array bound for the active-entities set returned by `aztec_utl_activeEntities`:
//   1 (count) + the correlation keys.
global ACTIVE_ENTITIES_MAX_FIELDS: u32 = 1 + FACT_MAX_ACTIVE_ENTITIES;

/// A single deserialized fact, ready for consumption in a fold.
pub struct PackedFact {
    pub fact_type_id: Field,
    pub payload: BoundedVec<Field, FACT_MAX_PAYLOAD>,
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

#[oracle(aztec_utl_activeEntities)]
unconstrained fn active_entities_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
) -> [Field; ACTIVE_ENTITIES_MAX_FIELDS] {}

#[oracle(aztec_utl_getEntityFacts)]
unconstrained fn get_entity_facts_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
) -> [Field; FACT_SET_MAX_FIELDS] {}

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

/// Returns the correlation keys of all currently active entities of the given type.
///
/// Fetches the flat count-prefixed array from the PXE oracle and unpacks it into a `BoundedVec`.
pub unconstrained fn active_entities(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
) -> BoundedVec<Field, FACT_MAX_ACTIVE_ENTITIES> {
    let flat = active_entities_oracle(contract_address, scope, entity_type_id);
    unpack_active_entities(flat)
}

/// Returns the deserialized fact set for the given entity.
///
/// Fetches the flat packed array from the PXE oracle and unpacks it into a `BoundedVec` of `PackedFact` values.
pub unconstrained fn get_entity_facts(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    correlation_key: Field,
) -> BoundedVec<PackedFact, FACT_MAX_FACTS> {
    let flat = get_entity_facts_oracle(contract_address, scope, entity_type_id, correlation_key);
    unpack(flat)
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

// Fact-set unpack

/// Unpacks a flat, self-describing field array into a `BoundedVec` of `PackedFact` values.
///
/// Wire layout (must match `packFactSet` in `fact_packing.ts` byte-for-byte):
/// ```
/// [ count,
///   for each fact: factTypeId, payloadLen, ...payload ]
/// ```
///
/// The loop bounds are compile-time constants; a running cursor threads through `flat` across iterations,
/// advancing by `2 + payload_len` per fact. Facts beyond `count` are skipped via the `if i < count` guard.
pub unconstrained fn unpack(flat: [Field; FACT_SET_MAX_FIELDS]) -> BoundedVec<PackedFact, FACT_MAX_FACTS> {
    let count = flat[0] as u32;
    let mut facts: BoundedVec<PackedFact, FACT_MAX_FACTS> = BoundedVec::new();
    // `cursor` tracks our position in `flat`. It starts at 1 (after the count field) and advances by
    // (2 + payload_len) for each fact we process.
    let mut cursor: u32 = 1;

    for i in 0..FACT_MAX_FACTS {
        if i < count {
            let fact_type_id = flat[cursor];
            let payload_len = flat[cursor + 1] as u32;
            cursor = cursor + 2;

            let mut payload: BoundedVec<Field, FACT_MAX_PAYLOAD> = BoundedVec::new();
            for j in 0..FACT_MAX_PAYLOAD {
                if j < payload_len {
                    payload.push(flat[cursor + j]);
                }
            }
            cursor = cursor + payload_len;

            facts.push(PackedFact { fact_type_id, payload });
        }
    }

    facts
}

/// Unpacks a flat, count-prefixed field array into a `BoundedVec` of correlation keys.
///
/// Wire layout (must match `packActiveEntities` in `fact_packing.ts`): `[ count, ...correlationKeys ]`, zero-padded
/// to `ACTIVE_ENTITIES_MAX_FIELDS`.
pub unconstrained fn unpack_active_entities(
    flat: [Field; ACTIVE_ENTITIES_MAX_FIELDS],
) -> BoundedVec<Field, FACT_MAX_ACTIVE_ENTITIES> {
    let count = flat[0] as u32;
    let mut keys: BoundedVec<Field, FACT_MAX_ACTIVE_ENTITIES> = BoundedVec::new();
    for i in 0..FACT_MAX_ACTIVE_ENTITIES {
        if i < count {
            keys.push(flat[1 + i]);
        }
    }
    keys
}

// Tests

mod test {
    use super::{ACTIVE_ENTITIES_MAX_FIELDS, FACT_SET_MAX_FIELDS, unpack, unpack_active_entities};

    /// Builds a zero-padded flat array of the given maximum size from a small literal slice.
    unconstrained fn make_flat<let N: u32>(values: [Field; N]) -> [Field; FACT_SET_MAX_FIELDS] {
        let mut flat: [Field; FACT_SET_MAX_FIELDS] = [0; FACT_SET_MAX_FIELDS];
        for i in 0..N {
            flat[i] = values[i];
        }
        flat
    }

    #[test]
    unconstrained fn unpacks_pinned_fact_set() {
        // TS pin: [{factTypeId:1, payload:[9]}, {factTypeId:2, payload:[]}] packs to [2, 1, 1, 9, 2, 0]
        let flat = make_flat([2, 1, 1, 9, 2, 0]);
        let facts = unpack(flat);

        assert_eq(facts.len(), 2);

        assert_eq(facts.get(0).fact_type_id, 1);
        assert_eq(facts.get(0).payload.len(), 1);
        assert_eq(facts.get(0).payload.get(0), 9);

        assert_eq(facts.get(1).fact_type_id, 2);
        assert_eq(facts.get(1).payload.len(), 0);
    }

    #[test]
    unconstrained fn unpacks_empty_fact_set() {
        // TS pin: [] packs to [0]
        let flat = make_flat([0]);
        let facts = unpack(flat);

        assert_eq(facts.len(), 0);
    }

    #[test]
    unconstrained fn unpacks_active_entities() {
        // TS pin: packActiveEntities([0xaa, 0xbb]) -> [2, 0xaa, 0xbb, ...padding]
        let mut flat: [Field; ACTIVE_ENTITIES_MAX_FIELDS] = [0; ACTIVE_ENTITIES_MAX_FIELDS];
        flat[0] = 2;
        flat[1] = 0xaa;
        flat[2] = 0xbb;

        let keys = unpack_active_entities(flat);

        assert_eq(keys.len(), 2);
        assert_eq(keys.get(0), 0xaa);
        assert_eq(keys.get(1), 0xbb);
    }
}
