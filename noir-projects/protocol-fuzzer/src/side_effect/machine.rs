use std::collections::{HashMap, HashSet};

use anyhow::Result;
use arbitrary::{Arbitrary, Unstructured};
use log::debug;

use crate::smt;
use super::system::SideEffectSystem;
use crate::wallet::{self, AccountId};

#[derive(Debug)]
pub struct SideEffectMachine {
    pub min_storage_slots: usize,
    pub max_storage_slots: usize,
}

impl Default for SideEffectMachine {
    fn default() -> Self {
        Self {
            min_storage_slots: 2,
            max_storage_slots: 5,
        }
    }
}

#[derive(Debug, Clone)]
pub enum SideEffectCommand {
    CreateNote {
        value: u128,
        owner: AccountId,
        storage_slot: u8,
        make_tx_hybrid: bool,
        from: AccountId,
    },
    CreateAndCompletePartialNote {
        owner: AccountId,
        storage_slot: u8,
        value: u128,
        from: AccountId,
    },
    ViewNotesMany {
        owner: AccountId,
        storage_slot: u8,
        active_or_nullified: bool,
        from: AccountId,
    },
    GetNotesMany {
        owner: AccountId,
        storage_slot: u8,
        active_or_nullified: bool,
        from: AccountId,
    },
    DestroyNote {
        owner: AccountId,
        storage_slot: u8,
        from: AccountId,
    },
    TestNoteInclusion {
        owner: AccountId,
        storage_slot: u8,
        from: AccountId,
    },
    EmitNullifier {
        nullifier: u128,
        from: AccountId,
    },
    TestNullifierInclusion {
        nullifier: u128,
        from: AccountId,
    },
}

#[derive(Debug, Clone, Default)]
pub struct SideEffectState {
    pub accounts: Vec<AccountId>,
    pub storage_slots: Vec<u8>,
    pub active_notes: HashMap<(u8, AccountId), Vec<u128>>,
    pub destroyed_notes: HashMap<(u8, AccountId), Vec<u128>>,
    pub emitted_nullifiers: HashSet<u128>,
}

fn choose_account(u: &mut Unstructured, state: &SideEffectState) -> arbitrary::Result<AccountId> {
    u.choose(&state.accounts).copied()
}

fn choose_storage_slot(u: &mut Unstructured, state: &SideEffectState) -> arbitrary::Result<u8> {
    u.choose(&state.storage_slots).copied()
}

fn gen_note_value(u: &mut Unstructured) -> arbitrary::Result<u128> {
    u.int_in_range(1..=u128::MAX)
}

fn gen_nullifier_value(u: &mut Unstructured) -> arbitrary::Result<u128> {
    u128::arbitrary(u)
}

/// Returns (slot, owner) pairs that have at least one active note.
fn populated_slots(state: &SideEffectState) -> Vec<(u8, AccountId)> {
    state
        .active_notes
        .iter()
        .filter(|(_, notes)| !notes.is_empty())
        .map(|(key, _)| *key)
        .collect()
}

/// Builds the list of expected note values for a (slot, owner) pair.
/// When `active_or_nullified` is true, includes both active and destroyed notes.
fn expected_notes(
    state: &SideEffectState,
    storage_slot: u8,
    owner: AccountId,
    active_or_nullified: bool,
) -> Vec<u128> {
    let key = (storage_slot, owner);
    let active = state.active_notes.get(&key).map(Vec::as_slice).unwrap_or_default();
    if active_or_nullified {
        let destroyed = state.destroyed_notes.get(&key).map(Vec::as_slice).unwrap_or_default();
        active.iter().chain(destroyed).copied().collect()
    } else {
        active.to_vec()
    }
}

/// Checks a multi-value note query result (ViewNotesMany, GetNotesMany).
/// Values of 0 are skipped (mean "no note at this position").
fn check_multi_note_query(
    cmd_name: &str,
    storage_slot: u8,
    owner: AccountId,
    output: &str,
    expected: &[u128],
) {
    if let Some(values) = wallet::parse_simulation_result_pair(output) {
        for v in &values {
            if *v != 0 {
                debug!("{cmd_name} slot {storage_slot} owner {owner}: checking {v} in {expected:?}");
                assert!(
                    expected.contains(v),
                    "{cmd_name} returned {v} which is not in expected notes {expected:?}",
                );
            }
        }
    }
}

impl smt::StateMachine for SideEffectMachine {
    type System = SideEffectSystem;
    type State = SideEffectState;
    type Command = SideEffectCommand;
    type Result = Result<String>;

    fn gen_state(&mut self, u: &mut Unstructured) -> arbitrary::Result<Self::State> {
        let mut state = Self::State {
            accounts: vec![0, 1, 2],
            ..Default::default()
        };

        // Generate random storage slots in range 1..=20
        let num_slots = u.int_in_range(self.min_storage_slots..=self.max_storage_slots)?;
        let mut slots = HashSet::new();
        while slots.len() < num_slots {
            let slot = u.int_in_range(1u8..=20)?;
            slots.insert(slot);
        }
        state.storage_slots = slots.into_iter().collect();
        state.storage_slots.sort();

        Ok(state)
    }

    fn gen_command(
        &self,
        u: &mut Unstructured,
        state: &Self::State,
    ) -> arbitrary::Result<Self::Command> {
        let pop = populated_slots(state);

        // Build command list based on preconditions.
        let mut choices: Vec<&str> = vec![
            "create_note",
            "create_note", // 2x weight
            "create_partial_note",
            "emit_nullifier",
        ];

        if !pop.is_empty() {
            choices.extend(&[
                "view_notes_many",
                "get_notes_many",
                "destroy_note",
                "test_note_inclusion",
            ]);
        }

        if !state.emitted_nullifiers.is_empty() {
            choices.push("test_nullifier_inclusion");
        }

        let cmd = *u.choose(&choices)?;

        // Helper: pick a populated (slot, owner), or ~20% of the time pick a
        // random pair to exercise empty-slot handling in the contract.
        let pick_slot_owner =
            |u: &mut Unstructured| -> arbitrary::Result<(u8, AccountId)> {
                let use_random = u.int_in_range(0u8..=4)? == 0;
                if use_random || pop.is_empty() {
                    Ok((choose_storage_slot(u, state)?, choose_account(u, state)?))
                } else {
                    Ok(*u.choose(&pop)?)
                }
            };

        let cmd = match cmd {
            "create_note" => SideEffectCommand::CreateNote {
                value: gen_note_value(u)?,
                owner: choose_account(u, state)?,
                storage_slot: choose_storage_slot(u, state)?,
                make_tx_hybrid: bool::arbitrary(u)?,
                from: choose_account(u, state)?,
            },
            "create_partial_note" => SideEffectCommand::CreateAndCompletePartialNote {
                owner: choose_account(u, state)?,
                storage_slot: choose_storage_slot(u, state)?,
                value: gen_note_value(u)?,
                from: choose_account(u, state)?,
            },
            "view_notes_many" => {
                // from must equal owner: note visibility is scoped to the owner's PXE.
                let (storage_slot, owner) = pick_slot_owner(u)?;
                SideEffectCommand::ViewNotesMany {
                    owner,
                    storage_slot,
                    active_or_nullified: bool::arbitrary(u)?,
                    from: owner,
                }
            }
            "get_notes_many" => {
                let (storage_slot, owner) = pick_slot_owner(u)?;
                SideEffectCommand::GetNotesMany {
                    owner,
                    storage_slot,
                    active_or_nullified: bool::arbitrary(u)?,
                    from: owner,
                }
            }
            "destroy_note" => {
                // Mostly target populated slots; occasionally random to test
                // expected failure on empty slots.
                let (storage_slot, owner) = pick_slot_owner(u)?;
                // from must equal owner: get_notes is private and only the
                // owner's PXE can discover notes belonging to that owner.
                SideEffectCommand::DestroyNote {
                    owner,
                    storage_slot,
                    from: owner,
                }
            }
            "test_note_inclusion" => {
                let (storage_slot, owner) = pick_slot_owner(u)?;
                // from must equal owner: get_notes is private and only the
                // owner's PXE can discover notes belonging to that owner.
                SideEffectCommand::TestNoteInclusion {
                    owner,
                    storage_slot,
                    from: owner,
                }
            }
            "emit_nullifier" => SideEffectCommand::EmitNullifier {
                nullifier: gen_nullifier_value(u)?,
                from: choose_account(u, state)?,
            },
            "test_nullifier_inclusion" => {
                let nullifiers: Vec<u128> = state.emitted_nullifiers.iter().copied().collect();
                let nullifier = *u.choose(&nullifiers)?;
                SideEffectCommand::TestNullifierInclusion {
                    nullifier,
                    from: choose_account(u, state)?,
                }
            }
            _ => unreachable!(),
        };

        Ok(cmd)
    }

    fn new_system(&mut self, _state: &Self::State) -> Self::System {
        let system =
            SideEffectSystem::new().expect("test system couldn't be prepared correctly");
        system
            .deploy_side_effect_contract(0)
            .expect("test contract could not be deployed");
        system
    }

    fn next_state(&self, cmd: &Self::Command, state: Self::State) -> Self::State {
        use SideEffectCommand::*;
        let mut state = state;

        match cmd {
            CreateNote { value, owner, storage_slot, .. }
            | CreateAndCompletePartialNote { owner, storage_slot, value, .. } => {
                state
                    .active_notes
                    .entry((*storage_slot, *owner))
                    .or_default()
                    .push(*value);
            }
            DestroyNote { owner, storage_slot, .. } => {
                let key = (*storage_slot, *owner);
                if let Some(notes) = state.active_notes.get_mut(&key) {
                    if !notes.is_empty() {
                        // The contract destroys retrieved_notes.get(0), which is the
                        // first note returned by the PXE (oldest/insertion order).
                        let value = notes.remove(0);
                        state.destroyed_notes.entry(key).or_default().push(value);
                    }
                }
            }
            EmitNullifier { nullifier, .. } => {
                state.emitted_nullifiers.insert(*nullifier);
            }
            // Query commands don't change state
            ViewNotesMany { .. } | GetNotesMany { .. }
            | TestNoteInclusion { .. } | TestNullifierInclusion { .. } => {}
        };

        state
    }

    fn run_command(&self, system: &mut Self::System, cmd: &Self::Command) -> Self::Result {
        system.execute_command(cmd)
    }

    fn check_result(&self, cmd: &Self::Command, pre_state: &Self::State, result: Self::Result) {
        use SideEffectCommand::*;

        match cmd {
            CreateNote { value, owner, storage_slot, .. } => {
                debug!("CreateNote value={value} owner={owner} slot={storage_slot}");
                assert!(
                    result.is_ok(),
                    "CreateNote failed for value {value}, owner {owner}, slot {storage_slot}: {:?}",
                    result.err()
                );
            }
            CreateAndCompletePartialNote { owner, storage_slot, value, .. } => {
                debug!("CreateAndCompletePartialNote owner={owner} slot={storage_slot} value={value}");
                assert!(
                    result.is_ok(),
                    "CreateAndCompletePartialNote failed for owner {owner}, slot {storage_slot}, value {value}: {:?}",
                    result.err()
                );
            }
            DestroyNote { owner, storage_slot, .. } => {
                let has_notes = pre_state
                    .active_notes
                    .get(&(*storage_slot, *owner))
                    .is_some_and(|n| !n.is_empty());
                if has_notes {
                    debug!("DestroyNote slot {storage_slot} owner {owner}: expecting success");
                    assert!(result.is_ok(), "DestroyNote failed on populated slot {storage_slot}, owner {owner}: {:?}", result.err());
                } else {
                    debug!("DestroyNote on empty slot {storage_slot} owner {owner}: expecting failure");
                    assert!(result.is_err(), "DestroyNote should fail on empty slot {storage_slot}, owner {owner}");
                }
            }
            TestNoteInclusion { owner, storage_slot, .. } => {
                let has_notes = pre_state
                    .active_notes
                    .get(&(*storage_slot, *owner))
                    .is_some_and(|n| !n.is_empty());
                if has_notes {
                    debug!("TestNoteInclusion slot {storage_slot} owner {owner}: expecting success");
                    assert!(result.is_ok(), "TestNoteInclusion failed on populated slot {storage_slot}, owner {owner}: {:?}", result.err());
                }
                // If no notes, result could be either — contract logic decides
            }
            EmitNullifier { nullifier, .. } => {
                let is_dup = pre_state.emitted_nullifiers.contains(nullifier);
                if is_dup {
                    debug!("EmitNullifier {nullifier}: expecting failure (duplicate)");
                    assert!(result.is_err(), "EmitNullifier should fail for duplicate nullifier {nullifier}");
                } else {
                    debug!("EmitNullifier {nullifier}: expecting success");
                    assert!(result.is_ok(), "EmitNullifier failed for new nullifier {nullifier}: {:?}", result.err());
                }
            }
            TestNullifierInclusion { nullifier, .. } => {
                debug!("TestNullifierInclusion {nullifier}: expecting success");
                assert!(
                    result.is_ok(),
                    "TestNullifierInclusion failed for nullifier {nullifier}: {:?}",
                    result.err()
                );
            }
            ViewNotesMany { owner, storage_slot, active_or_nullified, .. }
            | GetNotesMany { owner, storage_slot, active_or_nullified, .. } => {
                let name = match cmd { ViewNotesMany { .. } => "ViewNotesMany", _ => "GetNotesMany" };
                assert!(result.is_ok(), "{name} failed for owner {owner}, slot {storage_slot}: {:?}", result.as_ref().err());
                let expected = expected_notes(pre_state, *storage_slot, *owner, *active_or_nullified);
                check_multi_note_query(name, *storage_slot, *owner, &result.unwrap(), &expected);
            }
        }
    }

    fn check_system(
        &self,
        _cmd: &Self::Command,
        _post_state: &Self::State,
        _post_system: &Self::System,
    ) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::smt::StateMachine;

    fn make_state() -> SideEffectState {
        SideEffectState {
            accounts: vec![0, 1, 2],
            storage_slots: vec![1, 5, 10],
            ..Default::default()
        }
    }

    fn machine() -> SideEffectMachine {
        SideEffectMachine::default()
    }

    // -- next_state tests --

    #[test]
    fn create_note_adds_to_active() {
        let m = machine();
        let state = make_state();
        let cmd = SideEffectCommand::CreateNote {
            value: 42,
            owner: 0,
            storage_slot: 5,
            make_tx_hybrid: false,
            from: 1,
        };
        let state = m.next_state(&cmd, state);
        assert_eq!(state.active_notes[&(5, 0)], vec![42]);
    }

    #[test]
    fn partial_note_adds_to_active() {
        let m = machine();
        let state = make_state();
        let cmd = SideEffectCommand::CreateAndCompletePartialNote {
            owner: 1,
            storage_slot: 10,
            value: 99,
            from: 0,
        };
        let state = m.next_state(&cmd, state);
        assert_eq!(state.active_notes[&(10, 1)], vec![99]);
    }

    #[test]
    fn destroy_note_removes_first_note() {
        let m = machine();
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![10, 20, 30]);

        let cmd = SideEffectCommand::DestroyNote {
            owner: 0,
            storage_slot: 5,
            from: 0,
        };
        let state = m.next_state(&cmd, state);

        // First note (10) should be removed, not last (30)
        assert_eq!(state.active_notes[&(5, 0)], vec![20, 30]);
        assert_eq!(state.destroyed_notes[&(5, 0)], vec![10]);
    }

    #[test]
    fn destroy_note_on_empty_slot_is_noop() {
        let m = machine();
        let state = make_state();
        let cmd = SideEffectCommand::DestroyNote {
            owner: 0,
            storage_slot: 5,
            from: 0,
        };
        let state = m.next_state(&cmd, state);
        assert!(state.active_notes.is_empty());
        assert!(state.destroyed_notes.is_empty());
    }

    #[test]
    fn emit_nullifier_tracks_value() {
        let m = machine();
        let state = make_state();
        let cmd = SideEffectCommand::EmitNullifier {
            nullifier: 999,
            from: 0,
        };
        let state = m.next_state(&cmd, state);
        assert!(state.emitted_nullifiers.contains(&999));
    }

    #[test]
    fn query_commands_dont_change_state() {
        let m = machine();
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![42]);
        state.emitted_nullifiers.insert(99);

        let queries = vec![
            SideEffectCommand::ViewNotesMany {
                owner: 0, storage_slot: 5, active_or_nullified: true, from: 0,
            },
            SideEffectCommand::GetNotesMany {
                owner: 0, storage_slot: 5, active_or_nullified: true, from: 0,
            },
            SideEffectCommand::TestNoteInclusion {
                owner: 0, storage_slot: 5, from: 0,
            },
            SideEffectCommand::TestNullifierInclusion {
                nullifier: 99, from: 0,
            },
        ];

        for cmd in &queries {
            let new_state = m.next_state(cmd, state.clone());
            assert_eq!(new_state.active_notes, state.active_notes);
            assert_eq!(new_state.destroyed_notes, state.destroyed_notes);
            assert_eq!(new_state.emitted_nullifiers, state.emitted_nullifiers);
        }
    }

    // -- expected_notes tests --

    #[test]
    fn expected_notes_active_only() {
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![10, 20]);
        state.destroyed_notes.insert((5, 0), vec![30]);

        let result = expected_notes(&state, 5, 0, false);
        assert_eq!(result, vec![10, 20]);
    }

    #[test]
    fn expected_notes_active_or_nullified() {
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![10, 20]);
        state.destroyed_notes.insert((5, 0), vec![30]);

        let result = expected_notes(&state, 5, 0, true);
        assert_eq!(result, vec![10, 20, 30]);
    }

    #[test]
    fn expected_notes_empty_slot() {
        let state = make_state();
        assert!(expected_notes(&state, 5, 0, false).is_empty());
        assert!(expected_notes(&state, 5, 0, true).is_empty());
    }

    // -- populated_slots tests --

    #[test]
    fn populated_slots_filters_empty() {
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![42]);
        state.active_notes.insert((10, 1), vec![]);

        let pop = populated_slots(&state);
        assert_eq!(pop, vec![(5, 0)]);
    }

    // -- check helpers tests --

    #[test]
    fn check_multi_note_values_in_expected() {
        let output = "Simulation result:  [ 10n, 20n ]";
        check_multi_note_query("Test", 5, 0, output, &[10, 20, 30]);
    }

    #[test]
    fn check_multi_note_zero_values_skipped() {
        let output = "Simulation result:  [ 10n, 0n ]";
        // 0 is skipped, only 10 is checked
        check_multi_note_query("Test", 5, 0, output, &[10]);
    }

    #[test]
    #[should_panic(expected = "not in expected notes")]
    fn check_multi_note_value_not_in_expected() {
        let output = "Simulation result:  [ 10n, 99n ]";
        check_multi_note_query("Test", 5, 0, output, &[10, 20]);
    }

    // -- contract correspondence tests --
    // These verify the model's state transitions match contract semantics.

    /// The contract's `call_destroy_note` does `get_notes` then `retrieved_notes.get(0)`,
    /// always destroying the first note returned by the PXE (insertion order).
    /// Two sequential destroys must remove notes in FIFO order.
    #[test]
    fn sequential_destroys_remove_in_fifo_order() {
        let m = machine();
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![10, 20, 30]);

        let destroy = SideEffectCommand::DestroyNote {
            owner: 0, storage_slot: 5, from: 0,
        };

        // First destroy: removes 10 (oldest)
        let state = m.next_state(&destroy, state);
        assert_eq!(state.active_notes[&(5, 0)], vec![20, 30]);
        assert_eq!(state.destroyed_notes[&(5, 0)], vec![10]);

        // Second destroy: removes 20 (now oldest)
        let state = m.next_state(&destroy, state);
        assert_eq!(state.active_notes[&(5, 0)], vec![30]);
        assert_eq!(state.destroyed_notes[&(5, 0)], vec![10, 20]);

        // Third destroy: removes 30 (last one)
        let state = m.next_state(&destroy, state);
        assert!(state.active_notes[&(5, 0)].is_empty());
        assert_eq!(state.destroyed_notes[&(5, 0)], vec![10, 20, 30]);
    }

    /// After destroying a note, `expected_notes` with `active_or_nullified=true`
    /// must include it (matches contract's `NoteStatus.ACTIVE_OR_NULLIFIED`),
    /// while `active_or_nullified=false` must exclude it.
    #[test]
    fn destroyed_notes_visible_with_active_or_nullified_flag() {
        let m = machine();
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![10, 20, 30]);

        let state = m.next_state(
            &SideEffectCommand::DestroyNote { owner: 0, storage_slot: 5, from: 0 },
            state,
        );

        // active_or_nullified=false: only active notes
        let active = expected_notes(&state, 5, 0, false);
        assert_eq!(active, vec![20, 30]);
        assert!(!active.contains(&10));

        // active_or_nullified=true: active + destroyed
        let all = expected_notes(&state, 5, 0, true);
        assert!(all.contains(&10));
        assert!(all.contains(&20));
        assert!(all.contains(&30));
    }

    /// Duplicate nullifiers are tracked — second emit of same value is idempotent in the set.
    #[test]
    fn duplicate_nullifier_is_idempotent_in_model() {
        let m = machine();
        let state = make_state();

        let state = m.next_state(
            &SideEffectCommand::EmitNullifier { nullifier: 42, from: 0 },
            state,
        );
        assert!(state.emitted_nullifiers.contains(&42));

        // Same value again — still in the set (HashSet insert is idempotent)
        let state = m.next_state(
            &SideEffectCommand::EmitNullifier { nullifier: 42, from: 1 },
            state,
        );
        assert!(state.emitted_nullifiers.contains(&42));
    }

    /// Notes are scoped to (storage_slot, owner). Different owners on the same
    /// slot are independent — matches contract's `.set_owner(owner)` filter.
    #[test]
    fn notes_are_per_owner() {
        let m = machine();
        let state = make_state();

        let state = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 10, owner: 0, storage_slot: 5, make_tx_hybrid: false, from: 0,
            },
            state,
        );
        let state = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 20, owner: 1, storage_slot: 5, make_tx_hybrid: false, from: 0,
            },
            state,
        );

        assert_eq!(expected_notes(&state, 5, 0, false), vec![10]);
        assert_eq!(expected_notes(&state, 5, 1, false), vec![20]);
        assert!(expected_notes(&state, 5, 2, false).is_empty());
    }

    /// Same owner on different slots — notes are independent per slot.
    #[test]
    fn notes_are_per_slot() {
        let m = machine();
        let state = make_state();

        let state = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 10, owner: 0, storage_slot: 1, make_tx_hybrid: false, from: 0,
            },
            state,
        );
        let state = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 20, owner: 0, storage_slot: 5, make_tx_hybrid: false, from: 0,
            },
            state,
        );

        assert_eq!(expected_notes(&state, 1, 0, false), vec![10]);
        assert_eq!(expected_notes(&state, 5, 0, false), vec![20]);
    }

    /// CreateNote and CreateAndCompletePartialNote produce equivalent model state.
    /// Both contract functions result in a note with the given value at (slot, owner).
    #[test]
    fn create_and_partial_create_are_equivalent_in_model() {
        let m = machine();

        let state1 = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 42, owner: 0, storage_slot: 5, make_tx_hybrid: false, from: 1,
            },
            make_state(),
        );

        let state2 = m.next_state(
            &SideEffectCommand::CreateAndCompletePartialNote {
                owner: 0, storage_slot: 5, value: 42, from: 1,
            },
            make_state(),
        );

        assert_eq!(state1.active_notes, state2.active_notes);
    }

    /// make_tx_hybrid doesn't affect the model state — it only adds a dummy
    /// public call in the contract to make the tx hybrid (private + public).
    #[test]
    fn make_tx_hybrid_does_not_affect_model() {
        let m = machine();

        let state_plain = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 42, owner: 0, storage_slot: 5, make_tx_hybrid: false, from: 0,
            },
            make_state(),
        );

        let state_hybrid = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 42, owner: 0, storage_slot: 5, make_tx_hybrid: true, from: 0,
            },
            make_state(),
        );

        assert_eq!(state_plain.active_notes, state_hybrid.active_notes);
    }
}

