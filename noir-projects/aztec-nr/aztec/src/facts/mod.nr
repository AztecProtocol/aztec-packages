//! Per-contract storage of immutable facts grouped into collections, backed by PXE's FactStore.
//!
//! A fact is a contract-defined, typed, immutable datum. Facts are grouped into collections identified by a
//! `(contract, collection type, collection id)` triple; a collection comes into being when its first fact is recorded
//! and ceases to exist once it has no facts left. Facts are scoped: each is visible only under the scopes it was
//! recorded for, isolating one account's view from another's even within the same collection.

use crate::ephemeral::EphemeralArray;
use crate::oracle::fact_store::{
    get_fact_collection_oracle, get_fact_collections_by_type_oracle, record_fact_oracle, remove_fact_collection_oracle,
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
}

/// A fact collection as returned by the store: its id together with the facts visible to the reader.
#[derive(Deserialize, Serialize)]
pub struct FactCollection {
    pub fact_collection_id: Field,
    pub facts: EphemeralArray<Fact>,
}

/// Records a fact into a collection, visible under `scope`.
///
/// The collection is created implicitly on the first fact recorded for its key; recording into an existing collection
/// just adds to it. A `Some` origin block makes the fact retractable: it is pruned if that block is reorg'd away. A
/// `None` origin block makes it permanent, surviving reorgs until explicitly removed. Re-recording an identical fact is
/// a no-op.
pub unconstrained fn record_fact<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
    fact_type_id: Field,
    payload: [Field; N],
    origin_block: Option<OriginBlock>,
) {
    record_fact_oracle(
        contract_address,
        scope,
        fact_collection_type_id,
        fact_collection_id,
        fact_type_id,
        payload,
        origin_block,
    );
}

/// Removes a fact collection from `scope`.
///
/// Drops `scope` from each of the collection's facts, reaping any fact thereby left with no scope. A scope only ever
/// retracts its own view: facts another scope still references survive. A no-op if the collection is not visible under
/// `scope`.
pub unconstrained fn remove_fact_collection(
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
) {
    remove_fact_collection_oracle(
        contract_address,
        scope,
        fact_collection_type_id,
        fact_collection_id,
    );
}

/// Returns a fact collection, holding the facts visible under any of `scopes` (empty if none are).
pub unconstrained fn get_fact_collection<let N: u32>(
    contract_address: AztecAddress,
    scopes: [AztecAddress; N],
    fact_collection_type_id: Field,
    fact_collection_id: Field,
) -> FactCollection {
    get_fact_collection_oracle(
        contract_address,
        BoundedVec::<AztecAddress, N>::from_array(scopes),
        fact_collection_type_id,
        fact_collection_id,
    )
}

/// Returns every fact collection of `fact_collection_type_id` with at least one fact visible under any of `scopes`.
pub unconstrained fn get_fact_collections_by_type<let N: u32>(
    contract_address: AztecAddress,
    scopes: [AztecAddress; N],
    fact_collection_type_id: Field,
) -> EphemeralArray<FactCollection> {
    get_fact_collections_by_type_oracle(
        contract_address,
        BoundedVec::<AztecAddress, N>::from_array(scopes),
        fact_collection_type_id,
    )
}

mod test {
    use crate::facts::{
        get_fact_collection, get_fact_collections_by_type, OriginBlock, record_fact, remove_fact_collection,
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

    #[test]
    unconstrained fn records_and_reads_a_fact() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_fact(
                contract_address,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                [123],
                Option::none(),
            );

            let collection = get_fact_collection(contract_address, [scope], TYPE_ID, COLLECTION_ID);
            assert_eq(collection.fact_collection_id, COLLECTION_ID);
            assert_eq(collection.facts.len(), 1);
            assert_eq(collection.facts.get(0).fact_type_id, FACT_TYPE_ID);
        });
    }

    #[test]
    unconstrained fn reads_collections_by_type() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_fact(
                contract_address,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                [123],
                Option::none(),
            );

            let collections = get_fact_collections_by_type(contract_address, [scope], TYPE_ID);
            assert_eq(collections.len(), 1);
            assert_eq(collections.get(0).fact_collection_id, COLLECTION_ID);
        });
    }

    #[test]
    unconstrained fn records_a_retractable_fact() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_fact(
                contract_address,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                [123],
                Option::some(OriginBlock { block_number: 5, block_hash: 0xabc }),
            );

            let collection = get_fact_collection(contract_address, [scope], TYPE_ID, COLLECTION_ID);
            assert_eq(collection.facts.len(), 1);
        });
    }

    #[test]
    unconstrained fn removes_a_fact_collection() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_fact(
                contract_address,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                [123],
                Option::none(),
            );
            remove_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID);

            let collections = get_fact_collections_by_type(contract_address, [scope], TYPE_ID);
            assert_eq(collections.len(), 0);
        });
    }

    #[test]
    unconstrained fn reading_unknown_collection_returns_empty() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            let collection = get_fact_collection(contract_address, [scope], TYPE_ID, COLLECTION_ID);
            assert_eq(collection.facts.len(), 0);
        });
    }

    #[test(should_fail_with = "not allowed to access")]
    unconstrained fn cannot_record_for_other_contract() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let other = AztecAddress::from_field(context.this_address().to_field() + 1);
            record_fact(
                other,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                [123],
                Option::none(),
            );
        });
    }
}
