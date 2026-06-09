use crate::{ephemeral::EphemeralArray, protocol::{address::AztecAddress, traits::{Deserialize, Serialize}}};

/// A single fact about an entity: its type id, plus a payload carried in its own ephemeral array.
///
/// `payload` is a nested [`EphemeralArray`] so a fact can carry any number of fields without a fixed maximum.
#[derive(Serialize, Deserialize)]
pub struct Fact {
    pub fact_type_id: Field,
    pub payload: EphemeralArray<Field>,
}

/// Raw entity as returned by the oracle: payload + facts as slot-backed ephemeral arrays.
///
/// Internal to the EntityStore. Consumers use the typed [`Entity`], built by [`get_entity`].
#[derive(Deserialize, Serialize)]
struct RawEntity {
    payload: EphemeralArray<Field>,
    facts: EphemeralArray<Fact>,
}

/// An entity's stored state: its typed payload, plus the set of facts recorded against it.
///
/// `T` is the deserialized payload type (e.g. an offchain message). `facts` is a nested
/// [`EphemeralArray`] so an entity can carry any number of facts without a fixed maximum.
#[derive(Deserialize, Serialize)]
pub struct Entity<T> {
    pub payload: T,
    pub facts: EphemeralArray<Fact>,
}

/// The identity a value carries when stored as an entity body.
///
/// Implementors supply the two ids the store needs to address an entity: a per-type `entity_type_id` shared by every
/// entity of the same kind, and a per-instance `entity_id` derived from the value's content. Implement this to store a
/// type via [`NonRetractableEntity::create`] without passing those ids by hand.
pub trait EntityBody {
    /// The type id shared by all entities of this kind.
    fn entity_type_id() -> Field;

    /// The id that uniquely identifies this entity within its type, derived from its content.
    fn entity_id(self) -> Field;
}

impl<T> Entity<T>
where
    T: EntityBody + Serialize + Deserialize,
{
    /// Returns every currently active entity of kind `T` ([`EntityBody::entity_type_id`]), payload and facts included.
    ///
    /// Eagerly fetches each active entity. The query is keyed by entity type, so it returns active entities of this
    /// kind regardless of how they were created (retractable or not). The retractable and non-retractable handle types
    /// forward to this via their own `read_all_active`, re-wrapping each entity as the matching handle.
    pub unconstrained fn read_all_active(
        contract_address: AztecAddress,
        scope: AztecAddress,
    ) -> EphemeralArray<Entity<T>> {
        let keys = active_entities_oracle(contract_address, scope, T::entity_type_id());
        keys.map(|key| get_entity::<T>(contract_address, scope, T::entity_type_id(), key))
    }
}

/// A handle to a non-retractable entity in the store.
///
/// Non-retractable entities survive reorgs; only their own retractable facts are pruned. Build one with
/// [`NonRetractableEntity::create`], which performs the underlying store write, or obtain populated handles for every
/// active entity with [`NonRetractableEntity::read_all_active`].
#[derive(Deserialize, Serialize)]
pub struct NonRetractableEntity<T> {
    pub body: T,
    pub facts: EphemeralArray<Fact>,
}

impl<T> NonRetractableEntity<T>
where
    T: EntityBody + Serialize + Deserialize,
{
    /// Creates a non-retractable entity for `body` and returns a handle to it.
    ///
    /// The entity's type id and id are derived from `body` via [`EntityBody`], so callers never pass them. This writes
    /// to the store (hence `create`, not `new`); re-creating the same `body` records into the same entity. The returned
    /// handle carries no facts, matching the freshly created entity.
    pub unconstrained fn create(contract_address: AztecAddress, scope: AztecAddress, body: T) -> Self {
        create_non_retractable_entity(
            contract_address,
            scope,
            T::entity_type_id(),
            body.entity_id(),
            body,
        );
        Self { body, facts: EphemeralArray::empty() }
    }

    /// Returns a populated handle for every active entity of this kind, each carrying its `body` and `facts`.
    ///
    /// Forwards to [`Entity::read_all_active`] and re-wraps each entity as a [`NonRetractableEntity`].
    pub unconstrained fn read_all_active(
        contract_address: AztecAddress,
        scope: AztecAddress,
    ) -> EphemeralArray<NonRetractableEntity<T>> {
        Entity::<T>::read_all_active(contract_address, scope).map(|entity| {
            Self { body: entity.payload, facts: entity.facts }
        })
    }
}

/// A handle to a retractable entity in the store.
///
/// Retractable entities are tied to a block anchor; if that block is reorg'd away the entire entity - its payload and
/// every fact recorded against it - is pruned from the store. Build one with [`RetractableEntity::create`], which
/// performs the underlying store write, or obtain populated handles for every active entity with
/// [`RetractableEntity::read_all_active`]. See [`NonRetractableEntity`] for the reorg-surviving variant.
#[derive(Deserialize, Serialize)]
pub struct RetractableEntity<T> {
    pub body: T,
    pub facts: EphemeralArray<Fact>,
}

impl<T> RetractableEntity<T>
where
    T: EntityBody + Serialize + Deserialize,
{
    /// Creates a retractable entity for `body`, anchored at the given block, and returns a handle to it.
    ///
    /// The entity's type id and id are derived from `body` via [`EntityBody`], so callers never pass them. This writes
    /// to the store (hence `create`, not `new`); re-creating the same `body` records into the same entity. If the
    /// anchor block (`block_number`, `block_hash`) is later reorg'd away, the entity is pruned. The returned handle
    /// carries no facts, matching the freshly created entity.
    pub unconstrained fn create(
        contract_address: AztecAddress,
        scope: AztecAddress,
        body: T,
        block_number: u32,
        block_hash: Field,
    ) -> Self {
        create_retractable_entity(
            contract_address,
            scope,
            T::entity_type_id(),
            body.entity_id(),
            body,
            block_number,
            block_hash,
        );
        Self { body, facts: EphemeralArray::empty() }
    }

    /// Returns a populated handle for every active entity of this kind, each carrying its `body` and `facts`.
    ///
    /// Forwards to [`Entity::read_all_active`] and re-wraps each entity as a [`RetractableEntity`].
    pub unconstrained fn read_all_active(
        contract_address: AztecAddress,
        scope: AztecAddress,
    ) -> EphemeralArray<RetractableEntity<T>> {
        Entity::<T>::read_all_active(contract_address, scope).map(|entity| {
            Self { body: entity.payload, facts: entity.facts }
        })
    }
}

// Oracle declarations

#[oracle(aztec_utl_recordRetractableFact)]
unconstrained fn record_retractable_fact_oracle<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
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
    entity_id: Field,
    fact_type_id: Field,
    payload: [Field; N],
) {}

#[oracle(aztec_utl_createRetractableEntity)]
unconstrained fn create_retractable_entity_oracle<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
    payload: [Field; N],
    block_number: u32,
    block_hash: Field,
) {}

#[oracle(aztec_utl_createNonRetractableEntity)]
unconstrained fn create_non_retractable_entity_oracle<let N: u32>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
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
    entity_id: Field,
) -> RawEntity {}

#[oracle(aztec_utl_terminateEntity)]
unconstrained fn terminate_entity_oracle(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
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
    entity_id: Field,
    fact_type_id: Field,
    payload: [Field; N],
    block_number: u32,
    block_hash: Field,
) {
    record_retractable_fact_oracle(
        contract_address,
        scope,
        entity_type_id,
        entity_id,
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
    entity_id: Field,
    fact_type_id: Field,
    payload: [Field; N],
) {
    record_non_retractable_fact_oracle(
        contract_address,
        scope,
        entity_type_id,
        entity_id,
        fact_type_id,
        payload,
    );
}

/// Creates a retractable entity with the given payload.
///
/// Retractable entities are tied to a block anchor (`block_number`, `block_hash`); if that block is reorg'd away the
/// entire entity - its payload and every fact recorded against it - is pruned from the store.
pub(crate) unconstrained fn create_retractable_entity<T>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
    payload: T,
    block_number: u32,
    block_hash: Field,
)
where
    T: Serialize,
{
    create_retractable_entity_oracle(
        contract_address,
        scope,
        entity_type_id,
        entity_id,
        payload.serialize(),
        block_number,
        block_hash,
    );
}

/// Creates a non-retractable (permanent) entity with the given payload.
///
/// Non-retractable entities survive reorgs; only their own retractable facts are pruned.
pub(crate) unconstrained fn create_non_retractable_entity<T>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
    payload: T,
)
where
    T: Serialize,
{
    create_non_retractable_entity_oracle(
        contract_address,
        scope,
        entity_type_id,
        entity_id,
        payload.serialize(),
    );
}

/// Returns the given entity: its deserialized payload together with its fact set.
pub unconstrained fn get_entity<T>(
    contract_address: AztecAddress,
    scope: AztecAddress,
    entity_type_id: Field,
    entity_id: Field,
) -> Entity<T>
where
    T: Deserialize,
{
    let raw = get_entity_oracle(contract_address, scope, entity_type_id, entity_id);
    Entity { payload: raw.payload.read_as(), facts: raw.facts }
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
