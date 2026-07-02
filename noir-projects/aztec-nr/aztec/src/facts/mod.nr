//! Per-contract storage of immutable facts grouped into collections.
//!
//! A fact is a contract-defined, typed, immutable datum. Facts are grouped into collections identified by a
//! `(collection type, collection id)` tuple.
//!
//! They are stored in PXE's FactStore, which automatically deals with reorgs by removing any facts
//! associated with blocks that have been pruned.
use crate::ephemeral::EphemeralArray;
use crate::oracle::fact_store::{
    delete_fact_collection_oracle, get_fact_collection_oracle, get_fact_collections_by_type_oracle, record_fact_oracle,
};
use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}};

mod origin_state;
pub use origin_state::OriginBlockState;

/// The block a retractable fact originates from.
#[derive(Deserialize, Eq, Serialize)]
pub struct OriginBlock {
    pub block_number: u32,
    pub block_hash: Field,
}

/// A retractable fact's origin block.
#[derive(Deserialize, Eq, Serialize)]
pub struct RetractableFactOrigin {
    pub block_number: u32,
    pub block_hash: Field,
    pub block_state: OriginBlockState,
}

/// A single immutable fact in a collection.
#[derive(Deserialize, Serialize)]
pub struct Fact {
    /// A user-defined identifier for fact kinds. Typically used to determine how to deserialize `payload`.
    pub fact_type_id: Field,
    pub payload: EphemeralArray<Field>,
    /// The block the fact is associated to, if any. A fact with an origin block is said to be a 'retractable' fact,
    /// and will be automatically deleted if its origin block gets pruned in a reorg. Typically used by facts
    /// associated with a transaction (e.g. 'processed entry X using data from tx Y in block Z').
    pub origin_block: Option<RetractableFactOrigin>,
}

/// A fact collection as returned by the store.
#[derive(Deserialize, Serialize)]
pub struct FactCollection {
    pub contract_address: AztecAddress,
    pub scope: AztecAddress,
    /// The collection's type. A single contract may have facts in collections of different types (e.g. one for the
    /// processing offchain messages, another for partial notes, etc.).
    pub fact_collection_type_id: Field,
    /// The collection's unique identifier among the other collections of this type in this contract and scope.
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

/// Deletes a fact collection, removing all its facts from PXE storage.
///
/// Collections must be eventually deleted to reclaim storage and to stop reprocessing past the lifespan of the
/// workflows they enable.
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
    global PAYLOAD: [Field; 3] = [123, 456, 789];

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        (env, scope)
    }

    unconstrained fn make_payload<let N: u32>(values: [Field; N]) -> EphemeralArray<Field> {
        let payload: EphemeralArray<Field> = EphemeralArray::empty();
        for i in 0..N {
            payload.push(values[i]);
        }
        payload
    }

    unconstrained fn assert_payload(payload: EphemeralArray<Field>) {
        assert_eq(payload.len(), PAYLOAD.len());
        for i in 0..PAYLOAD.len() {
            assert_eq(payload.get(i), PAYLOAD[i]);
        }
    }

    unconstrained fn record_fact(contract_address: AztecAddress, scope: AztecAddress) {
        record_non_retractable_fact(
            contract_address,
            scope,
            TYPE_ID,
            COLLECTION_ID,
            FACT_TYPE_ID,
            make_payload(PAYLOAD),
        );
    }

    #[test]
    unconstrained fn records_and_reads_a_fact() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_fact(contract_address, scope);

            let collection = get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID).unwrap();
            assert_eq(collection.contract_address, contract_address);
            assert_eq(collection.scope, scope);
            assert_eq(collection.fact_collection_type_id, TYPE_ID);
            assert_eq(collection.fact_collection_id, COLLECTION_ID);
            assert_eq(collection.facts.len(), 1);

            let fact = collection.facts.get(0);
            assert_eq(fact.fact_type_id, FACT_TYPE_ID);
            assert_payload(fact.payload);
            assert(fact.origin_block.is_none());
        });
    }

    #[test]
    unconstrained fn reads_collections_by_type() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_fact(contract_address, scope);

            let collections = get_fact_collections_by_type(contract_address, scope, TYPE_ID);
            assert_eq(collections.len(), 1);

            let collection = collections.get(0);
            assert_eq(collection.fact_collection_id, COLLECTION_ID);
            assert_eq(collection.facts.len(), 1);

            let fact = collection.facts.get(0);
            assert_eq(fact.fact_type_id, FACT_TYPE_ID);
            assert_payload(fact.payload);
        });
    }

    #[test]
    unconstrained fn records_a_retractable_fact_finalized_at_latest_block() {
        let (env, scope) = setup();
        let origin_block_number = env.last_block_number();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_retractable_fact(
                contract_address,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                make_payload(PAYLOAD),
                OriginBlock { block_number: origin_block_number, block_hash: 0xabc },
            );

            let collection = get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID).unwrap();
            assert_eq(collection.facts.len(), 1);

            let fact = collection.facts.get(0);
            assert_eq(fact.fact_type_id, FACT_TYPE_ID);
            assert_payload(fact.payload);

            let origin = fact.origin_block.unwrap();
            assert_eq(origin.block_number, origin_block_number);
            assert_eq(origin.block_hash, 0xabc);
            // TXE finalizes every mined block, so an origin at the latest block is Finalized.
            assert(origin.block_state.is_finalized());
        });
    }

    #[test]
    unconstrained fn retractable_fact_above_proven_tip_is_pending() {
        let (env, scope) = setup();
        let future_block_number = env.last_block_number() + 100;
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_retractable_fact(
                contract_address,
                scope,
                TYPE_ID,
                COLLECTION_ID,
                FACT_TYPE_ID,
                make_payload(PAYLOAD),
                OriginBlock { block_number: future_block_number, block_hash: 0xabc },
            );

            let origin = get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID)
                .unwrap()
                .facts
                .get(0)
                .origin_block
                .unwrap();
            assert(origin.block_state.is_pending());
        });
    }

    #[test]
    unconstrained fn deletes_a_fact_collection() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_fact(contract_address, scope);
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
            record_fact(other, scope);
        });
    }

    #[test]
    unconstrained fn re_recording_an_identical_fact_is_a_no_op() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            record_fact(contract_address, scope);
            record_fact(contract_address, scope);

            let collection = get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID).unwrap();
            assert_eq(collection.facts.len(), 1);
        });
    }

    #[test]
    unconstrained fn deleting_a_non_existing_collection_is_a_no_op() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            delete_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID);

            assert(get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID).is_none());
        });
    }

    #[test]
    unconstrained fn recording_a_fact_after_delete_recreates_the_collection() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();

            record_fact(contract_address, scope);
            let collection_before_delete =
                get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID).unwrap();
            assert_eq(collection_before_delete.facts.len(), 1);

            delete_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID);
            assert(get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID).is_none());

            record_fact(contract_address, scope);
            let collection_after_recreate =
                get_fact_collection(contract_address, scope, TYPE_ID, COLLECTION_ID).unwrap();
            assert_eq(collection_after_recreate.facts.len(), 1);
        });
    }
}
