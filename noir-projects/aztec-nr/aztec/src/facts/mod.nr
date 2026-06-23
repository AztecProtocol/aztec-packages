//! Per-contract storage of immutable facts grouped into collections, backed by PXE's FactStore.
//!
//! A fact is a contract-defined, typed, immutable datum. Facts are grouped into collections identified by a
//! `(collection type, collection id)` tuple.
use crate::ephemeral::EphemeralArray;
use crate::oracle::fact_store::{
    delete_fact_collection_oracle, get_fact_collection_oracle, get_fact_collections_by_type_oracle, record_fact_oracle,
};
use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}};

/// The block a retractable fact originates from.
#[derive(Deserialize, Eq, Serialize)]
pub struct OriginBlock {
    pub block_number: u32,
    pub block_hash: Field,
}

/// A single immutable fact in a collection.
#[derive(Deserialize, Serialize)]
pub struct Fact {
    pub fact_type_id: Field,
    pub payload: EphemeralArray<Field>,
    pub origin_block: Option<OriginBlock>,
}

/// A fact collection as returned by the store.
#[derive(Deserialize, Serialize)]
pub struct FactCollection {
    pub contract_address: AztecAddress,
    pub scope: AztecAddress,
    pub fact_collection_type_id: Field,
    pub fact_collection_id: Field,
    pub facts: EphemeralArray<Fact>,
}

/// Records a retractable fact into a collection: PXE prunes it if `origin_block` is reorg'd away. Re-recording an
/// identical fact is a no-op.
pub unconstrained fn record_retractable_fact(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
    fact_type_id: Field,
    payload: EphemeralArray<Field>,
    origin_block: OriginBlock,
) {
    record_fact_oracle(
        contract_address,
        scope,
        fact_collection_type_id,
        fact_collection_id,
        fact_type_id,
        payload,
        Option::some(origin_block),
    );
}

/// Records a non-retractable fact into a collection: it survives reorgs and will persist until the fact collection
/// itself is deleted. Re-recording an identical fact is a no-op.
pub unconstrained fn record_non_retractable_fact(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
    fact_type_id: Field,
    payload: EphemeralArray<Field>,
) {
    record_fact_oracle(
        contract_address,
        scope,
        fact_collection_type_id,
        fact_collection_id,
        fact_type_id,
        payload,
        Option::none(),
    );
}

/// Deletes a fact collection.
///
/// A no-op if no such collection exists.
pub unconstrained fn delete_fact_collection(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
) {
    delete_fact_collection_oracle(
        contract_address,
        scope,
        fact_collection_type_id,
        fact_collection_id,
    );
}

/// Fetches a fact collection.
pub unconstrained fn get_fact_collection(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
) -> Option<FactCollection> {
    get_fact_collection_oracle(
        contract_address,
        scope,
        fact_collection_type_id,
        fact_collection_id,
    )
}

/// Returns every fact collection of `fact_collection_type_id`.
pub unconstrained fn get_fact_collections_by_type(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
) -> EphemeralArray<FactCollection> {
    get_fact_collections_by_type_oracle(contract_address, scope, fact_collection_type_id)
}

mod test {
    use crate::ephemeral::EphemeralArray;
    use crate::facts::{
        delete_fact_collection, get_fact_collection, get_fact_collections_by_type, OriginBlock,
        record_non_retractable_fact, record_retractable_fact,
    };
    use crate::protocol::address::AztecAddress;
    use crate::protocol::traits::{FromField, ToField};
    use crate::test::helpers::test_environment::TestEnvironment;

    global TYPE_ID: Field = 42;
    global COLLECTION_ID: Field = 7;
    global FACT_TYPE_ID: Field = 99;

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        (env, scope)
    }

    unconstrained fn make_payload(value: Field) -> EphemeralArray<Field> {
        let payload: EphemeralArray<Field> = EphemeralArray::empty();
        payload.push(value);
        payload
    }

    #[test]
    unconstrained fn records_and_reads_a_fact() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_non_retractable_fact(
                contract_address,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                make_payload(123),
            );

            let collection = get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID).unwrap();
            assert_eq(collection.contract_address, contract_address);
            assert_eq(collection.scope, scope);
            assert_eq(collection.fact_collection_type_id, TYPE_ID);
            assert_eq(collection.fact_collection_id, COLLECTION_ID);
            assert_eq(collection.facts.len(), 1);

            let fact = collection.facts.get(0);
            assert_eq(fact.fact_type_id, FACT_TYPE_ID);
            assert_eq(fact.payload.get(0), 123);
            assert(fact.origin_block.is_none());
        });
    }

    #[test]
    unconstrained fn reads_collections_by_type() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_non_retractable_fact(
                contract_address,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                make_payload(123),
            );

            let collections = get_fact_collections_by_type(contract_address, scope, TYPE_ID);
            assert_eq(collections.len(), 1);
            assert_eq(collections.get(0).fact_collection_id, COLLECTION_ID);
        });
    }

    #[test]
    unconstrained fn records_a_retractable_fact() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_retractable_fact(
                contract_address,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                make_payload(123),
                OriginBlock { block_number: 5, block_hash: 0xabc },
            );

            let collection = get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID).unwrap();
            assert_eq(collection.facts.len(), 1);

            let origin_block = collection.facts.get(0).origin_block.unwrap();
            assert_eq(origin_block.block_number, 5);
            assert_eq(origin_block.block_hash, 0xabc);
        });
    }

    #[test]
    unconstrained fn deletes_a_fact_collection() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_non_retractable_fact(
                contract_address,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                make_payload(123),
            );
            delete_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID);

            let collections = get_fact_collections_by_type(contract_address, scope, TYPE_ID);
            assert_eq(collections.len(), 0);
        });
    }

    #[test]
    unconstrained fn reading_unknown_collection_returns_none() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            let collection = get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID);
            assert(collection.is_none());
        });
    }

    #[test(should_fail_with = "not allowed to access")]
    unconstrained fn cannot_record_for_other_contract() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let other = AztecAddress::from_field(context.this_address().to_field() + 1);
            record_non_retractable_fact(
                other,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                make_payload(123),
            );
        });
    }
}
