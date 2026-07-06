use aztec::{
    ephemeral::EphemeralArray,
    facts::{delete_fact_collection, Fact, FactCollection, get_fact_collection, OriginBlock, record_retractable_fact},
    protocol::{address::AztecAddress, hash::sha256_to_field, traits::{Deserialize, Serialize}},
};

/// Fact type id of a register version. Registers are distinguished by their collection type and id, so all of them
/// share a single fact type.
global REWINDABLE_REGISTER_VALUE: Field = sha256_to_field("HANDSHAKE_REGISTRY::REWINDABLE_REGISTER_VALUE".as_bytes());

/// A reorg-aware mutable value.
///
/// Each mutation performed on a `RewindableRegister` is conditional to a given block existing. When, due to a
/// reorg, the block a mutation is tied to drops out of the chain, the register is transparently rolled back to its
/// pre-mutation value.
pub(crate) struct RewindableRegister<T> {
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
}

// Mutation is modeled as versioning over immutable retractable facts: every write records a new fact originated at
// a block, and reads select the version with the highest surviving origin. A reorg retracts exactly the versions
// from pruned blocks, so rollback is performed by the store, never by the writer. Versions originated at or before
// the finalized tip can never be retracted, making anything older than the newest finalized version unreachable, so
// writes compact that dead history away.
impl<T> RewindableRegister<T> {
    /// Returns the register stored in the given fact collection.
    pub(crate) unconstrained fn at(
        contract_address: AztecAddress,
        scope: AztecAddress,
        fact_collection_type_id: Field,
        fact_collection_id: Field,
    ) -> Self {
        Self { contract_address, scope, fact_collection_type_id, fact_collection_id }
    }

    /// Returns the current value.
    ///
    /// Returns `None` if nothing was ever written, or a reorg rolled back every write.
    pub(crate) unconstrained fn read(self) -> Option<T>
    where
        T: Deserialize,
    {
        self.versions().map(|versions| deserialize_payload(current_version(versions).payload))
    }

    /// Sets a new value for this register, conditional to the given `origin_block`.
    ///
    /// If a reorg drops `origin_block`, the write is rolled back and the previous value becomes current again. Also
    /// compacts history that finality has made unreachable.
    ///
    /// # Panics
    /// If `origin_block` is strictly behind the current version's origin: the current version is the one with the
    /// highest origin block, not the most recently written, so a write originating behind it would not take effect.
    /// Re-writing at the current version's origin is allowed: re-recording an identical fact is a no-op, which
    /// keeps rescans idempotent.
    pub(crate) unconstrained fn write(self, value: T, origin_block: OriginBlock)
    where
        T: Serialize,
    {
        let versions = self.versions();
        if versions.is_some() {
            let versions = versions.unwrap();
            assert(
                origin_block.block_number >= current_version(versions).origin_block.unwrap().block_number,
                "RewindableRegister write originates behind the current version",
            );
            self.compact(versions);
        }

        self.record_version(serialize_payload(value), origin_block);
    }

    /// Returns every surviving version, or `None` if there is none.
    unconstrained fn versions(self) -> Option<EphemeralArray<Fact>> {
        get_fact_collection(
            self.contract_address,
            self.scope,
            self.fact_collection_type_id,
            self.fact_collection_id,
        )
            .map(|collection: FactCollection| collection.facts)
    }

    /// Discards versions that finality has made unreachable.
    ///
    /// Everything behind the newest finalized version can never become current again. The store has no per-fact
    /// deletion, so compacting means recreating the collection with the survivors.
    unconstrained fn compact(self, versions: EphemeralArray<Fact>) {
        let maybe_newest_finalized = newest_finalized_block_number(versions);
        if maybe_newest_finalized.is_some() {
            let newest_finalized = maybe_newest_finalized.unwrap();
            if has_versions_behind(versions, newest_finalized) {
                delete_fact_collection(
                    self.contract_address,
                    self.scope,
                    self.fact_collection_type_id,
                    self.fact_collection_id,
                );
                versions.for_each(|_i, version| {
                    let origin = version.origin_block.unwrap();
                    if origin.block_number >= newest_finalized {
                        self.record_version(
                            version.payload,
                            OriginBlock { block_number: origin.block_number, block_hash: origin.block_hash },
                        );
                    }
                });
            }
        }
    }

    /// Records a version fact at the given origin block.
    unconstrained fn record_version(self, payload: EphemeralArray<Field>, origin_block: OriginBlock) {
        record_retractable_fact(
            self.contract_address,
            self.scope,
            self.fact_collection_type_id,
            self.fact_collection_id,
            REWINDABLE_REGISTER_VALUE,
            payload,
            origin_block,
        );
    }
}

/// Returns the current version (highest origin block).
unconstrained fn current_version(versions: EphemeralArray<Fact>) -> Fact {
    // The store does not guarantee any ordering within a collection, so select the version explicitly.
    let mut current = versions.get(0);
    for i in 1..versions.len() {
        let version = versions.get(i);
        if version.origin_block.unwrap().block_number > current.origin_block.unwrap().block_number {
            current = version;
        }
    }
    current
}

/// Returns whether any version is strictly behind `block_number`.
unconstrained fn has_versions_behind(versions: EphemeralArray<Fact>, block_number: u32) -> bool {
    versions.any(|version| version.origin_block.unwrap().block_number < block_number)
}

/// Returns the newest finalized origin block number, if any.
unconstrained fn newest_finalized_block_number(versions: EphemeralArray<Fact>) -> Option<u32> {
    // The store does not guarantee any ordering within a collection, so select the version explicitly.
    let mut newest: Option<u32> = Option::none();
    for i in 0..versions.len() {
        let origin = versions.get(i).origin_block.unwrap();
        if origin.block_state.is_finalized() & newest.map_or(true, |n| origin.block_number > n) {
            newest = Option::some(origin.block_number);
        }
    }
    newest
}

/// Serializes a value into a fact payload.
pub(crate) unconstrained fn serialize_payload<T>(value: T) -> EphemeralArray<Field>
where
    T: Serialize,
{
    let fields = value.serialize();
    let payload = EphemeralArray::empty();
    for i in 0..fields.len() {
        payload.push(fields[i]);
    }
    payload
}

/// Deserializes a fact payload into a value.
///
/// # Panics
/// If the payload length does not match the value's serialized length.
pub(crate) unconstrained fn deserialize_payload<T>(payload: EphemeralArray<Field>) -> T
where
    T: Deserialize,
{
    let n = <T as Deserialize>::N;
    assert_eq(payload.len(), n, "Fact payload length does not match the value's serialized length");
    let mut fields = [0; <T as Deserialize>::N];
    for i in 0..n {
        fields[i] = payload.get(i);
    }
    T::deserialize(fields)
}

mod test {
    use super::RewindableRegister;
    use aztec::facts::{get_fact_collection, OriginBlock};
    use aztec::protocol::address::AztecAddress;
    use aztec::test::helpers::test_environment::TestEnvironment;

    global TYPE_ID: Field = 4242;
    global COLLECTION_ID: Field = 7;

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        (env, scope)
    }

    unconstrained fn register_at(contract_address: AztecAddress, scope: AztecAddress) -> RewindableRegister<Field> {
        RewindableRegister::at(contract_address, scope, TYPE_ID, COLLECTION_ID)
    }

    #[test]
    unconstrained fn unwritten_register_reads_none() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let register = register_at(context.this_address(), scope);
            assert(register.read().is_none());
        });
    }

    #[test]
    unconstrained fn reads_back_written_value() {
        let (env, scope) = setup();
        let block_number = env.last_block_number();
        env.private_context(|context| {
            let register = register_at(context.this_address(), scope);
            register.write(123, OriginBlock { block_number, block_hash: 0xabc });

            assert_eq(register.read().unwrap(), 123);
        });
    }

    #[test]
    unconstrained fn newest_origin_wins() {
        let (env, scope) = setup();
        let block_number = env.last_block_number();
        env.private_context(|context| {
            let register = register_at(context.this_address(), scope);
            register.write(1, OriginBlock { block_number, block_hash: 0xabc });
            register.write(2, OriginBlock { block_number: block_number + 50, block_hash: 0xdef });

            assert_eq(register.read().unwrap(), 2);
        });
    }

    #[test(should_fail_with = "originates behind the current version")]
    unconstrained fn write_behind_the_current_version_panics() {
        let (env, scope) = setup();
        let block_number = env.last_block_number();
        env.private_context(|context| {
            let register = register_at(context.this_address(), scope);
            register.write(1, OriginBlock { block_number: block_number + 50, block_hash: 0xabc });
            register.write(2, OriginBlock { block_number, block_hash: 0xdef });
        });
    }

    #[test]
    unconstrained fn rewriting_at_the_current_origin_is_a_no_op() {
        let (env, scope) = setup();
        let block_number = env.last_block_number();
        env.private_context(|context| {
            let register = register_at(context.this_address(), scope);
            register.write(1, OriginBlock { block_number, block_hash: 0xabc });
            register.write(1, OriginBlock { block_number, block_hash: 0xabc });

            assert_eq(register.read().unwrap(), 1);
            let facts = get_fact_collection(context.this_address(), scope, TYPE_ID, COLLECTION_ID).unwrap().facts;
            assert_eq(facts.len(), 1);
        });
    }

    #[test]
    unconstrained fn pending_versions_are_kept() {
        let (env, scope) = setup();
        let block_number = env.last_block_number();
        env.private_context(|context| {
            let register = register_at(context.this_address(), scope);
            register.write(1, OriginBlock { block_number, block_hash: 0xabc });
            register.write(2, OriginBlock { block_number: block_number + 50, block_hash: 0xdef });
            register.write(3, OriginBlock { block_number: block_number + 100, block_hash: 0x123 });

            // All origins are above the proven tip, hence pending: none is finalized dead history, so every version
            // is kept as a reorg fallback.
            let facts = get_fact_collection(context.this_address(), scope, TYPE_ID, COLLECTION_ID).unwrap().facts;
            assert_eq(facts.len(), 3);
        });
    }

    #[test]
    unconstrained fn collapses_history_behind_newest_finalized_version() {
        let (env, scope) = setup();
        env.mine_block();
        env.mine_block();
        let block_number = env.last_block_number();
        env.private_context(|context| {
            let register = register_at(context.this_address(), scope);
            register.write(1, OriginBlock { block_number: block_number - 2, block_hash: 0xabc });
            register.write(2, OriginBlock { block_number: block_number - 1, block_hash: 0xdef });
            register.write(3, OriginBlock { block_number, block_hash: 0x123 });

            // TXE finalizes every mined block, so all three origins are finalized and each write discards history
            // behind the newest finalized version, leaving the last two.
            let facts = get_fact_collection(context.this_address(), scope, TYPE_ID, COLLECTION_ID).unwrap().facts;
            assert_eq(facts.len(), 2);
            assert_eq(facts.get(0).origin_block.unwrap().block_number, block_number - 1);
            assert_eq(facts.get(1).origin_block.unwrap().block_number, block_number);

            assert_eq(register.read().unwrap(), 3);
        });
    }
}
