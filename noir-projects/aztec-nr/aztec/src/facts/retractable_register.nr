use crate::ephemeral::EphemeralArray;
use crate::protocol::{address::AztecAddress, hash::sha256_to_field, traits::{Deserialize, Serialize}};
use super::{
    delete_fact_collection, Fact, FactCollection, get_fact_collection, OriginBlock, record_retractable_fact,
    RetractableFactOrigin,
};

/// Fact type id of a register version. Registers are distinguished by their collection type and id, so all of them
/// share a single fact type.
global RETRACTABLE_REGISTER_VALUE: Field = sha256_to_field("AZTEC_NR::RETRACTABLE_REGISTER_VALUE".as_bytes());

/// A reorg-aware mutable value backed by retractable facts.
///
/// Facts are immutable, so mutation is modeled as versioning: every [`write`](Self::write) appends a new version
/// anchored at an origin block, and [`read`](Self::read) returns the version with the highest surviving origin.
/// Because versions are retractable facts, a reorg deletes exactly the versions from pruned blocks and the previous
/// surviving version becomes current again: rollback is performed by the store, never by the writer.
///
/// # Compaction
///
/// Versions originated at or before the finalized tip can never be retracted, so anything older than the newest
/// finalized version can never become current again. [`write`](Self::write) discards that dead history. After the
/// first finalized write, a reorg can therefore roll the register back at worst to that finalized version.
pub struct RetractableRegister<T> {
    contract_address: AztecAddress,
    scope: AztecAddress,
    fact_collection_type_id: Field,
    fact_collection_id: Field,
}

impl<T> RetractableRegister<T> {
    /// Returns the register stored in the given fact collection.
    pub unconstrained fn at(
        contract_address: AztecAddress,
        scope: AztecAddress,
        fact_collection_type_id: Field,
        fact_collection_id: Field,
    ) -> Self {
        Self { contract_address, scope, fact_collection_type_id, fact_collection_id }
    }

    /// Returns the current value and its origin block.
    ///
    /// The current version is the one with the highest surviving origin. Returns `None` if no version survives:
    /// nothing was ever written, or a reorg retracted every version.
    pub unconstrained fn read(self) -> Option<(T, RetractableFactOrigin)>
    where
        T: Deserialize,
    {
        self.maybe_versions().map(|versions| {
            let current = current_version(versions);
            (deserialize_payload(current.payload), current.origin_block.unwrap())
        })
    }

    /// Appends a new version anchored at `origin_block`.
    ///
    /// Also discards history that finality has made unreachable. Reorging `origin_block` away retracts the version
    /// and the previous survivor becomes current.
    ///
    /// # Panics
    /// If `origin_block` is strictly behind the current version's origin: the current version is the one with the
    /// highest origin block, not the most recently written, so a write anchored behind it would not take effect.
    /// Re-writing at the current version's origin is allowed: re-recording an identical fact is a no-op, which
    /// keeps rescans idempotent.
    pub unconstrained fn write(self, value: T, origin_block: OriginBlock)
    where
        T: Serialize,
    {
        let maybe_versions = self.maybe_versions();
        if maybe_versions.is_some() {
            let versions = maybe_versions.unwrap();
            assert(
                origin_block.block_number >= current_version(versions).origin_block.unwrap().block_number,
                "RetractableRegister write is anchored behind the current version",
            );
            self.discard_dead_history(versions);
        }

        self.record_version(serialize_payload(value), origin_block);
    }

    /// Returns every surviving version, or `None` if there is none.
    unconstrained fn maybe_versions(self) -> Option<EphemeralArray<Fact>> {
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
    /// deletion, so discarding means recreating the collection with the survivors.
    unconstrained fn discard_dead_history(self, versions: EphemeralArray<Fact>) {
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
                versions
                    .filter(|version| version.origin_block.unwrap().block_number >= newest_finalized)
                    .for_each(|_i, version| {
                        let origin = version.origin_block.unwrap();
                        self.record_version(
                            version.payload,
                            OriginBlock { block_number: origin.block_number, block_hash: origin.block_hash },
                        );
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
            RETRACTABLE_REGISTER_VALUE,
            payload,
            origin_block,
        );
    }
}

/// Returns the current version (highest origin block).
unconstrained fn current_version(versions: EphemeralArray<Fact>) -> Fact {
    // Writes are anchored at monotonically non-decreasing origins (enforced by `write`) and the store preserves
    // insertion order across retraction and compaction, so the last surviving version is current.
    versions.get(versions.len() - 1)
}

/// Returns whether any version is strictly behind `block_number`.
unconstrained fn has_versions_behind(versions: EphemeralArray<Fact>, block_number: u32) -> bool {
    versions.any(|version| version.origin_block.unwrap().block_number < block_number)
}

/// Returns the newest finalized origin block number, if any.
unconstrained fn newest_finalized_block_number(versions: EphemeralArray<Fact>) -> Option<u32> {
    let finalized = versions.filter(|version| version.origin_block.unwrap().block_state.is_finalized());
    if finalized.len() == 0 {
        Option::none()
    } else {
        // Versions are ordered by origin, so the last finalized one is the newest.
        Option::some(
            finalized.get(finalized.len() - 1).origin_block.unwrap().block_number,
        )
    }
}

unconstrained fn serialize_payload<T>(value: T) -> EphemeralArray<Field>
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

unconstrained fn deserialize_payload<T>(payload: EphemeralArray<Field>) -> T
where
    T: Deserialize,
{
    let n = <T as Deserialize>::N;
    let mut fields = [0; <T as Deserialize>::N];
    for i in 0..n {
        fields[i] = payload.get(i);
    }
    T::deserialize(fields)
}

mod test {
    use crate::facts::{get_fact_collection, OriginBlock};
    use crate::protocol::address::AztecAddress;
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::RetractableRegister;

    global TYPE_ID: Field = 4242;
    global COLLECTION_ID: Field = 7;

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        (env, scope)
    }

    unconstrained fn register_at(contract_address: AztecAddress, scope: AztecAddress) -> RetractableRegister<Field> {
        RetractableRegister::at(contract_address, scope, TYPE_ID, COLLECTION_ID)
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
    unconstrained fn reads_back_written_value_and_origin() {
        let (env, scope) = setup();
        let block_number = env.last_block_number();
        env.private_context(|context| {
            let register = register_at(context.this_address(), scope);
            register.write(123, OriginBlock { block_number, block_hash: 0xabc });

            let (value, origin) = register.read().unwrap();
            assert_eq(value, 123);
            assert_eq(origin.block_number, block_number);
            assert_eq(origin.block_hash, 0xabc);
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

            let (value, origin) = register.read().unwrap();
            assert_eq(value, 2);
            assert_eq(origin.block_number, block_number + 50);
        });
    }

    #[test(should_fail_with = "anchored behind the current version")]
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

            let (value, _) = register.read().unwrap();
            assert_eq(value, 1);
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
        let (mut env, scope) = setup();
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

            let (value, _) = register.read().unwrap();
            assert_eq(value, 3);
        });
    }
}
