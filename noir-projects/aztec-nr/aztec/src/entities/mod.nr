//! Typed, per-contract storage of entities and the immutable facts recorded about them, backed by PXE's EntityStore.

use crate::ephemeral::EphemeralArray;
use crate::oracle::entity_store::{
    create_entity_oracle, get_entities_oracle, get_entity_oracle, record_fact_oracle, terminate_entity_oracle,
};
use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}};

/// The block an entity or fact originates from.
#[derive(Deserialize, Eq, Serialize)]
pub struct OriginBlock {
    pub block_number: u32,
    pub block_hash: Field,
}

/// A single fact about an entity.
#[derive(Serialize, Deserialize)]
pub struct Fact {
    pub fact_type_id: Field,
    pub payload: EphemeralArray<Field>,
}

/// Raw entity as returned by the oracle: body + facts as slot-backed ephemeral arrays.
///
/// Internal to the entity store. Consumers use the typed [`Entity`], built by [`get_entity`] / [`get_entities`].
#[derive(Deserialize, Serialize)]
pub(crate) struct RawEntity {
    body: EphemeralArray<Field>,
    facts: EphemeralArray<Fact>,
}

impl RawEntity {
    /// Deserializes the raw body field-array into `T` and wraps it as a typed [`Entity`].
    unconstrained fn into_entity<T>(self, contract_address: AztecAddress, scope: AztecAddress) -> Entity<T>
    where
        T: Deserialize,
    {
        let n = <T as Deserialize>::N;
        assert_eq(self.body.len(), n, "entity body length mismatch");
        let mut fields = [0; <T as Deserialize>::N];
        for i in 0..n {
            fields[i] = self.body.get(i);
        }
        Entity { contract_address, scope, body: Deserialize::deserialize(fields), facts: self.facts }
    }
}

/// The identity a value carries when stored as an entity body.
///
/// Implementors supply the two ids the store needs to identify an entity: a per-type `entity_type_id` shared by every
/// entity of the same kind, and a per-instance `entity_id` derived from the value's content.
pub trait EntityBody {
    /// The type id shared by all entities of this kind.
    fn entity_type_id() -> Field;

    /// The id that uniquely identifies this entity within its type, derived from its content.
    fn entity_id(self) -> Field;
}

/// A handle to an entity in the store.
#[derive(Deserialize, Serialize)]
pub struct Entity<T> {
    pub contract_address: AztecAddress,
    pub scope: AztecAddress,
    pub body: T,
    pub facts: EphemeralArray<Fact>,
}

impl<T> Entity<T>
where
    T: EntityBody + Serialize + Deserialize,
{
    /// Creates a retractable entity for `body`, with the given block as origin, and returns a handle to it.
    pub unconstrained fn create_retractable(
        contract_address: AztecAddress,
        scope: AztecAddress,
        body: T,
        block_number: u32,
        block_hash: Field,
    ) -> Self {
        create_entity(
            contract_address,
            scope,
            T::entity_type_id(),
            body.entity_id(),
            body,
            Option::some(OriginBlock { block_number, block_hash }),
        );
        Self { contract_address, scope, body, facts: EphemeralArray::empty() }
    }

    /// Creates a non-retractable entity for `body` and returns a handle to it.
    pub unconstrained fn create_non_retractable(contract_address: AztecAddress, scope: AztecAddress, body: T) -> Self {
        create_entity(
            contract_address,
            scope,
            T::entity_type_id(),
            body.entity_id(),
            body,
            Option::none(),
        );
        Self { contract_address, scope, body, facts: EphemeralArray::empty() }
    }

    /// Returns a populated handle for every active entity of this kind, each carrying its `body` and `facts`.
    pub unconstrained fn read_all(contract_address: AztecAddress, scope: AztecAddress) -> EphemeralArray<Entity<T>> {
        get_entities::<T>(contract_address, scope, T::entity_type_id())
    }

    /// Logs a retractable fact about this entity, originated at `(block_number, block_hash)`.
    ///
    /// The fact is pruned from the store if that block is reorg'd away. Note a fact's retractability is independent of
    /// the entity's, so either kind of entity may carry retractable facts.
    pub unconstrained fn log_retractable_fact<let N: u32>(
        self,
        fact_type_id: Field,
        payload: [Field; N],
        block_number: u32,
        block_hash: Field,
    ) {
        record_fact(
            self.contract_address,
            self.scope,
            T::entity_type_id(),
            self.body.entity_id(),
            fact_type_id,
            payload,
            Option::some(OriginBlock { block_number, block_hash }),
        );
    }

    /// Records a permanent (non-retractable) fact about this entity.
    ///
    /// This fact survives reorgs and is never pruned on its own, unless its entity is retracted as a whole.
    pub unconstrained fn log_non_retractable_fact<let N: u32>(self, fact_type_id: Field, payload: [Field; N]) {
        record_fact(
            self.contract_address,
            self.scope,
            T::entity_type_id(),
            self.body.entity_id(),
            fact_type_id,
            payload,
            Option::none(),
        );
    }

    /// Terminates this entity, preventing new facts from being recorded for it. See [`terminate_entity`].
    pub unconstrained fn terminate(self) {
        terminate_entity(
            self.contract_address,
            self.scope,
            T::entity_type_id(),
            self.body.entity_id(),
        );
    }
}

// Public wrappers around the entity store oracles.

/// Creates an entity.
pub(crate) unconstrained fn create_entity<T>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
    body: T,
    origin_block: Option<OriginBlock>,
)
where
    T: Serialize,
{
    create_entity_oracle(
        contract_address,
        scope,
        entity_type_id,
        entity_id,
        body.serialize(),
        origin_block,
    );
}

/// Records a fact for an entity.
pub(crate) unconstrained fn record_fact<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
    fact_type_id: Field,
    payload: [Field; N],
    origin_block: Option<OriginBlock>,
) {
    record_fact_oracle(
        contract_address,
        scope,
        entity_type_id,
        entity_id,
        fact_type_id,
        payload,
        origin_block,
    );
}

/// Returns every active entity of kind `entity_type_id`: each one's deserialized body together with its fact set.
pub unconstrained fn get_entities<T>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
) -> EphemeralArray<Entity<T>>
where
    T: Serialize + Deserialize,
{
    get_entities_oracle(contract_address, scope, entity_type_id).map(|raw: RawEntity| {
        raw.into_entity(contract_address, scope)
    })
}

/// Returns the given entity: its deserialized body together with its fact set.
pub unconstrained fn get_entity<T>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
) -> Entity<T>
where
    T: Deserialize,
{
    get_entity_oracle(contract_address, scope, entity_type_id, entity_id).into_entity(contract_address, scope)
}

/// Marks an entity as terminated, preventing new facts from being recorded for it.
pub unconstrained fn terminate_entity(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
) {
    terminate_entity_oracle(contract_address, scope, entity_type_id, entity_id);
}

mod test {
    use crate::entities::{Entity, EntityBody};
    use crate::protocol::address::AztecAddress;
    use crate::protocol::traits::{Deserialize, FromField, Serialize, ToField};
    use crate::test::helpers::test_environment::TestEnvironment;

    global TYPE_ID: Field = 42;

    #[derive(Deserialize, Eq, Serialize)]
    struct MockBody {
        id: Field,
        value: Field,
    }

    impl EntityBody for MockBody {
        fn entity_type_id() -> Field {
            TYPE_ID
        }

        fn entity_id(self) -> Field {
            self.id
        }
    }

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        (env, scope)
    }

    #[test]
    unconstrained fn creates_and_reads_non_retractable_entity() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            let body = MockBody { id: 1, value: 7 };
            let _ = Entity::create_non_retractable(contract_address, scope, body);

            let active = Entity::<MockBody>::read_all(contract_address, scope);
            assert_eq(active.len(), 1);
            assert_eq(active.get(0).body, body);
        });
    }

    #[test]
    unconstrained fn records_fact_on_entity() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            let entity = Entity::create_non_retractable(contract_address, scope, MockBody { id: 1, value: 7 });
            entity.log_non_retractable_fact(99, [123]);

            let active = Entity::<MockBody>::read_all(contract_address, scope);
            let facts = active.get(0).facts;
            assert_eq(facts.len(), 1);
            assert_eq(facts.get(0).fact_type_id, 99);
        });
    }

    #[test]
    unconstrained fn terminates_entity() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            let entity = Entity::create_non_retractable(contract_address, scope, MockBody { id: 1, value: 7 });
            entity.terminate();

            let active = Entity::<MockBody>::read_all(contract_address, scope);
            assert_eq(active.len(), 0);
        });
    }

    #[test]
    unconstrained fn creates_retractable_entity() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let contract_address = context.this_address();
            let _ = Entity::create_retractable(
                contract_address,
                scope,
                MockBody { id: 2, value: 9 },
                5,
                0xabc,
            );

            let active = Entity::<MockBody>::read_all(contract_address, scope);
            assert_eq(active.len(), 1);
            assert_eq(active.get(0).body.value, 9);
        });
    }

    #[test(should_fail_with = "not allowed to access")]
    unconstrained fn cannot_create_for_other_contract() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let other = AztecAddress::from_field(context.this_address().to_field() + 1);
            let _ = Entity::create_non_retractable(other, scope, MockBody { id: 1, value: 7 });
        });
    }
}
