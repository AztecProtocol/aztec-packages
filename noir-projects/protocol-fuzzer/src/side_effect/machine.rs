use std::collections::{HashMap, HashSet};

use anyhow::Result;
use arbitrary::{Arbitrary, Unstructured};
use log::debug;

use super::system::SideEffectSystem;
use crate::smt::{self, Batchable};
use crate::wallet::{self, AccountId, Bridge};

pub(crate) type NoteValue = u128;
pub(crate) type NullifierValue = u128;
pub(crate) type StorageSlotId = u8;

/// Upper bound on the number of storage slots. Keeps the state space manageable.
const MAX_STORAGE_SLOTS: usize = 20;

#[derive(Debug)]
pub struct SideEffectMachine<'a> {
    pub storage_slots: usize,
    /// Required for `new_system()` (deploy + import). `None` is fine for
    /// model-only tests that never call `new_system`.
    pub bridge: Option<&'a Bridge>,
    /// Directory containing compiled contract JSON artifacts (resolved to
    /// an absolute path in `SideEffectSystem::new`).
    pub artifacts_dir: String,
}

#[derive(Debug, Clone)]
pub enum SideEffectCommand {
    CreateNote {
        value: NoteValue,
        owner: AccountId,
        storage_slot: StorageSlotId,
        from: AccountId,
        via_parent: bool,
    },
    CreateAndCompletePartialNote {
        owner: AccountId,
        storage_slot: StorageSlotId,
        value: NoteValue,
        from: AccountId,
    },
    ViewNotesMany {
        owner: AccountId,
        storage_slot: StorageSlotId,
        active_or_nullified: bool,
        offset: u32,
        from: AccountId,
    },
    GetNotesMany {
        owner: AccountId,
        storage_slot: StorageSlotId,
        active_or_nullified: bool,
        offset: u32,
        from: AccountId,
    },
    DestroyNote {
        owner: AccountId,
        storage_slot: StorageSlotId,
        from: AccountId,
        via_parent: bool,
    },
    TestNoteInclusion {
        owner: AccountId,
        storage_slot: StorageSlotId,
        from: AccountId,
        via_parent: bool,
    },
    EmitNullifier {
        nullifier: NullifierValue,
        from: AccountId,
        via_parent: bool,
    },
    TestNullifierInclusion {
        nullifier: NullifierValue,
        from: AccountId,
        via_parent: bool,
    },
}

impl SideEffectCommand {
    pub(crate) fn name(&self) -> &'static str {
        match self {
            Self::CreateNote { .. } => "CreateNote",
            Self::CreateAndCompletePartialNote { .. } => "CreateAndCompletePartialNote",
            Self::ViewNotesMany { .. } => "ViewNotesMany",
            Self::GetNotesMany { .. } => "GetNotesMany",
            Self::DestroyNote { .. } => "DestroyNote",
            Self::TestNoteInclusion { .. } => "TestNoteInclusion",
            Self::EmitNullifier { .. } => "EmitNullifier",
            Self::TestNullifierInclusion { .. } => "TestNullifierInclusion",
        }
    }

    /// How to execute on the sandbox: `Simulate` for read-only view/get,
    /// `Send` for everything else. Note that `TestNoteInclusion` and
    /// `TestNullifierInclusion` are sends (on-chain kernel verification)
    /// even though they don't change model state -- see `is_query()`.
    pub fn verb(&self) -> wallet::Verb {
        match self {
            Self::ViewNotesMany { .. } | Self::GetNotesMany { .. } => wallet::Verb::Simulate,
            Self::CreateNote { .. }
            | Self::CreateAndCompletePartialNote { .. }
            | Self::DestroyNote { .. }
            | Self::TestNoteInclusion { .. }
            | Self::EmitNullifier { .. }
            | Self::TestNullifierInclusion { .. } => wallet::Verb::Send,
        }
    }

    /// Whether this command doesn't change model state (and therefore must
    /// observe all prior committed state before executing, flushing the batch).
    /// This is orthogonal to `verb()`: TestNoteInclusion/TestNullifierInclusion
    /// are queries (`is_query = true`) but sends (`verb = Send`) because they
    /// exercise on-chain kernel verification without changing the fuzzer's model.
    pub fn is_query(&self) -> bool {
        match self {
            Self::ViewNotesMany { .. }
            | Self::GetNotesMany { .. }
            | Self::TestNoteInclusion { .. }
            | Self::TestNullifierInclusion { .. } => true,
            Self::CreateNote { .. }
            | Self::CreateAndCompletePartialNote { .. }
            | Self::DestroyNote { .. }
            | Self::EmitNullifier { .. } => false,
        }
    }

    pub(crate) fn via_parent(&self) -> bool {
        match self {
            Self::CreateNote { via_parent, .. }
            | Self::DestroyNote { via_parent, .. }
            | Self::TestNoteInclusion { via_parent, .. }
            | Self::EmitNullifier { via_parent, .. }
            | Self::TestNullifierInclusion { via_parent, .. } => *via_parent,
            Self::CreateAndCompletePartialNote { .. }
            | Self::ViewNotesMany { .. }
            | Self::GetNotesMany { .. } => false,
        }
    }

    /// The `(storage_slot, owner)` pair for note operations, if applicable.
    fn slot_owner(&self) -> Option<(StorageSlotId, AccountId)> {
        match self {
            Self::CreateNote {
                storage_slot,
                owner,
                ..
            }
            | Self::CreateAndCompletePartialNote {
                storage_slot,
                owner,
                ..
            }
            | Self::DestroyNote {
                storage_slot,
                owner,
                ..
            }
            | Self::TestNoteInclusion {
                storage_slot,
                owner,
                ..
            } => Some((*storage_slot, *owner)),
            Self::ViewNotesMany { .. }
            | Self::GetNotesMany { .. }
            | Self::EmitNullifier { .. }
            | Self::TestNullifierInclusion { .. } => None,
        }
    }

    /// The nullifier value for nullifier operations, if applicable.
    fn nullifier_val(&self) -> Option<NullifierValue> {
        match self {
            Self::EmitNullifier { nullifier, .. }
            | Self::TestNullifierInclusion { nullifier, .. } => Some(*nullifier),
            Self::CreateNote { .. }
            | Self::CreateAndCompletePartialNote { .. }
            | Self::DestroyNote { .. }
            | Self::TestNoteInclusion { .. }
            | Self::ViewNotesMany { .. }
            | Self::GetNotesMany { .. } => None,
        }
    }
}

impl Batchable for SideEffectCommand {
    fn conflicts(&self, other: &Self) -> bool {
        // Queries don't change state so they can batch with each other, but a
        // query/send mix must flush (query needs to observe prior sends).
        if self.is_query() || other.is_query() {
            return !(self.is_query() && other.is_query());
        }

        // Same (slot, owner) pair -> conflict.
        if let (Some(a), Some(b)) = (self.slot_owner(), other.slot_owner()) {
            if a == b {
                return true;
            }
        }

        // Same nullifier value -> conflict (EmitNullifier(x) vs EmitNullifier(x)
        // or TestNullifierInclusion(x)).
        if let (Some(a), Some(b)) = (self.nullifier_val(), other.nullifier_val()) {
            if a == b {
                return true;
            }
        }

        false
    }
}

#[derive(Debug, Clone, Default)]
pub struct SideEffectState {
    pub accounts: Vec<AccountId>,
    pub storage_slots: Vec<StorageSlotId>,
    pub active_notes: HashMap<(StorageSlotId, AccountId), Vec<NoteValue>>,
    pub destroyed_notes: HashMap<(StorageSlotId, AccountId), Vec<NoteValue>>,
    pub emitted_nullifiers: HashSet<NullifierValue>,
}

fn choose_account(u: &mut Unstructured, state: &SideEffectState) -> arbitrary::Result<AccountId> {
    u.choose(&state.accounts).copied()
}

fn choose_storage_slot(
    u: &mut Unstructured,
    state: &SideEffectState,
) -> arbitrary::Result<StorageSlotId> {
    u.choose(&state.storage_slots).copied()
}

/// Generate a non-zero note value. Zero is reserved as the "no note found"
/// sentinel in the contract's view/get return values.
fn gen_note_value(u: &mut Unstructured) -> arbitrary::Result<NoteValue> {
    u.int_in_range(1..=NoteValue::MAX)
}

fn gen_nullifier_value(u: &mut Unstructured) -> arbitrary::Result<NullifierValue> {
    u128::arbitrary(u)
}

/// (slot, owner) pairs with at least one active note.
fn populated_slots(state: &SideEffectState) -> Vec<(StorageSlotId, AccountId)> {
    let mut slots: Vec<_> = state
        .active_notes
        .iter()
        .filter(|(_, notes)| !notes.is_empty())
        .map(|(key, _)| *key)
        .collect();
    slots.sort();
    slots
}

fn assert_expected(name: &str, expect_ok: bool, result: &anyhow::Result<String>) {
    if expect_ok {
        debug!("{name}: expecting success");
        assert!(
            result.is_ok(),
            "{name} unexpectedly failed: {:?}",
            result.as_ref().err()
        );
    } else {
        debug!("{name}: expecting failure");
        assert!(result.is_err(), "{name} unexpectedly succeeded");
    }
}

/// Expected note values for a (slot, owner) pair, after skipping `offset` notes.
/// The contract sorts by value ASC before applying the offset, so we sort and skip
/// here too. With `active_or_nullified`, includes destroyed notes.
///
/// TODO: Sort by counter instead of value. Notes with the same value can be
/// returned in arbitrary order by the oracle, but counters are unique, giving
/// a deterministic ordering the fuzzer model can predict exactly.
fn expected_notes(
    state: &SideEffectState,
    storage_slot: StorageSlotId,
    owner: AccountId,
    active_or_nullified: bool,
    offset: u32,
) -> Vec<NoteValue> {
    let key = (storage_slot, owner);
    let active = state
        .active_notes
        .get(&key)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let mut all: Vec<NoteValue> = if active_or_nullified {
        let destroyed = state
            .destroyed_notes
            .get(&key)
            .map(Vec::as_slice)
            .unwrap_or_default();
        active.iter().chain(destroyed).copied().collect()
    } else {
        active.to_vec()
    };
    all.sort();
    all.into_iter().skip(offset as usize).collect()
}

/// Checks a multi-value note query result against the first N expected values
/// (sorted ASC). 0 means "no note at this position".
fn check_multi_note_query(
    cmd_name: &str,
    storage_slot: StorageSlotId,
    owner: AccountId,
    output: &str,
    expected: &[NoteValue],
) {
    let values = wallet::parse_simulation_result_pair(output)
        .expect("failed to parse simulation result pair from CLI output");
    let returned: Vec<_> = values.iter().copied().filter(|v| *v != 0).collect();
    let expected_prefix: Vec<_> = expected.iter().copied().take(values.len()).collect();
    debug!(
        "{cmd_name} slot {storage_slot} owner {owner}: returned={returned:?}, expected_prefix={expected_prefix:?}"
    );
    assert_eq!(
        returned, expected_prefix,
        "{cmd_name} slot {storage_slot} owner {owner}: returned values don't match expected prefix. full expected={expected:?}",
    );
}

impl<'a> smt::StateMachine for SideEffectMachine<'a> {
    type System = SideEffectSystem<'a>;
    type State = SideEffectState;
    type Command = SideEffectCommand;
    type Result = Result<String>;

    fn gen_state(&mut self, _u: &mut Unstructured) -> arbitrary::Result<Self::State> {
        let mut state = Self::State {
            accounts: vec![0, 1, 2],
            ..Default::default()
        };

        assert!(
            self.storage_slots <= MAX_STORAGE_SLOTS,
            "storage_slots ({}) exceeds MAX_STORAGE_SLOTS ({MAX_STORAGE_SLOTS})",
            self.storage_slots,
        );
        state.storage_slots = (1..=self.storage_slots as StorageSlotId).collect();

        Ok(state)
    }

    fn gen_command(
        &self,
        u: &mut Unstructured,
        state: &Self::State,
    ) -> arbitrary::Result<Self::Command> {
        let pop = populated_slots(state);

        // Build command list based on preconditions. Mutations have extra weight
        // so queries (which flush the parallel batch) are ~15% of commands.
        let mut choices = crate::util::weighted_choices(&[
            ("create_note", 8),
            ("create_partial_note", 3),
            ("emit_nullifier", 3),
        ]);

        if !pop.is_empty() {
            choices.extend(crate::util::weighted_choices(&[
                ("view_notes_many", 1),
                ("get_notes_many", 1),
                ("destroy_note", 8),
                ("test_note_inclusion", 1),
            ]));
        }

        if !state.emitted_nullifiers.is_empty() {
            choices.push("test_settled_nullifier_inclusion");
        }

        let cmd = *u.choose(&choices)?;

        // ~20% of the time pick a random pair to exercise empty-slot paths.
        let pick_slot_owner =
            |u: &mut Unstructured| -> arbitrary::Result<(StorageSlotId, AccountId)> {
                if pop.is_empty() || u.ratio(1, 5)? {
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
                from: choose_account(u, state)?,
                via_parent: bool::arbitrary(u)?,
            },
            "create_partial_note" => SideEffectCommand::CreateAndCompletePartialNote {
                owner: choose_account(u, state)?,
                storage_slot: choose_storage_slot(u, state)?,
                value: gen_note_value(u)?,
                from: choose_account(u, state)?,
            },
            "view_notes_many" => {
                // Notes are only visible to the owner.
                let (storage_slot, owner) = pick_slot_owner(u)?;
                SideEffectCommand::ViewNotesMany {
                    owner,
                    storage_slot,
                    active_or_nullified: bool::arbitrary(u)?,
                    offset: u.int_in_range(0..=4)?,
                    from: owner,
                }
            }
            "get_notes_many" => {
                let (storage_slot, owner) = pick_slot_owner(u)?;
                SideEffectCommand::GetNotesMany {
                    owner,
                    storage_slot,
                    active_or_nullified: bool::arbitrary(u)?,
                    offset: u.int_in_range(0..=4)?,
                    from: owner,
                }
            }
            "destroy_note" => {
                let (storage_slot, owner) = pick_slot_owner(u)?;
                SideEffectCommand::DestroyNote {
                    owner,
                    storage_slot,
                    from: owner,
                    via_parent: bool::arbitrary(u)?,
                }
            }
            "test_note_inclusion" => {
                let (storage_slot, owner) = pick_slot_owner(u)?;
                SideEffectCommand::TestNoteInclusion {
                    owner,
                    storage_slot,
                    from: owner,
                    via_parent: bool::arbitrary(u)?,
                }
            }
            "emit_nullifier" => SideEffectCommand::EmitNullifier {
                nullifier: gen_nullifier_value(u)?,
                from: choose_account(u, state)?,
                via_parent: bool::arbitrary(u)?,
            },
            "test_settled_nullifier_inclusion" => {
                let mut nullifiers: Vec<NullifierValue> =
                    state.emitted_nullifiers.iter().copied().collect();
                nullifiers.sort();
                let nullifier = *u.choose(&nullifiers)?;
                SideEffectCommand::TestNullifierInclusion {
                    nullifier,
                    from: choose_account(u, state)?,
                    via_parent: bool::arbitrary(u)?,
                }
            }
            _ => unreachable!(),
        };

        Ok(cmd)
    }

    fn new_system(&mut self, _state: &Self::State) -> Self::System {
        // Test accounts are deterministic (fixed keys + zero salt), so
        // re-importing always yields the same addresses. Each deploy uses a
        // unique salt, so back-to-back runs get fresh contract instances.
        let bridge = self.bridge.expect("bridge required for new_system()");
        bridge
            .import_test_accounts()
            .expect("could not import test accounts");
        let system = SideEffectSystem::new(bridge, &self.artifacts_dir);
        system
            .deploy_side_effect_contract(0)
            .expect("side-effect contract could not be deployed");
        system
            .deploy_parent_contract(0)
            .expect("parent contract could not be deployed");
        system
    }

    fn next_state(&self, cmd: &Self::Command, mut state: Self::State) -> Self::State {
        use SideEffectCommand::*;

        match cmd {
            CreateNote {
                value,
                owner,
                storage_slot,
                ..
            }
            | CreateAndCompletePartialNote {
                owner,
                storage_slot,
                value,
                ..
            } => {
                let notes = state
                    .active_notes
                    .entry((*storage_slot, *owner))
                    .or_default();
                let pos = notes.partition_point(|v| *v < *value);
                notes.insert(pos, *value);
            }
            DestroyNote {
                owner,
                storage_slot,
                ..
            } => {
                let key = (*storage_slot, *owner);
                if let Some(notes) = state.active_notes.get_mut(&key) {
                    if !notes.is_empty() {
                        // Contract sorts by value ASC, destroys get(0) (smallest).
                        let value = notes.remove(0);
                        state.destroyed_notes.entry(key).or_default().push(value);
                    }
                }
            }
            EmitNullifier { nullifier, .. } => {
                state.emitted_nullifiers.insert(*nullifier);
            }
            // Query commands don't change state
            ViewNotesMany { .. }
            | GetNotesMany { .. }
            | TestNoteInclusion { .. }
            | TestNullifierInclusion { .. } => {}
        };

        state
    }

    fn run_command(&self, system: &mut Self::System, cmd: &Self::Command) -> Self::Result {
        system.execute_command(cmd)
    }

    fn run_command_batch(
        &self,
        system: &mut Self::System,
        cmds: &[Self::Command],
    ) -> Vec<Self::Result> {
        system.execute_command_batch(cmds)
    }

    fn check_result(&self, cmd: &Self::Command, pre_state: &Self::State, result: Self::Result) {
        use SideEffectCommand::*;

        match cmd {
            CreateNote {
                value,
                owner,
                storage_slot,
                ..
            }
            | CreateAndCompletePartialNote {
                owner,
                storage_slot,
                value,
                ..
            } => {
                let name = cmd.name();
                debug!("{name} value={value} owner={owner} slot={storage_slot}");
                assert!(
                    result.is_ok(),
                    "{name} failed for value {value}, owner {owner}, slot {storage_slot}: {:?}",
                    result.err()
                );
            }
            DestroyNote {
                owner,
                storage_slot,
                ..
            }
            | TestNoteInclusion {
                owner,
                storage_slot,
                ..
            } => {
                let has_notes = pre_state
                    .active_notes
                    .get(&(*storage_slot, *owner))
                    .is_some_and(|n| !n.is_empty());
                assert_expected(cmd.name(), has_notes, &result);
            }
            EmitNullifier { nullifier, .. } => {
                let is_new = !pre_state.emitted_nullifiers.contains(nullifier);
                assert_expected(cmd.name(), is_new, &result);
            }
            TestNullifierInclusion { .. } => {
                assert_expected(cmd.name(), true, &result);
            }
            ViewNotesMany {
                owner,
                storage_slot,
                active_or_nullified,
                offset,
                ..
            }
            | GetNotesMany {
                owner,
                storage_slot,
                active_or_nullified,
                offset,
                ..
            } => {
                let name = cmd.name();
                assert!(
                    result.is_ok(),
                    "{name} failed for owner {owner}, slot {storage_slot}: {:?}",
                    result.as_ref().err()
                );
                let expected = expected_notes(
                    pre_state,
                    *storage_slot,
                    *owner,
                    *active_or_nullified,
                    *offset,
                );
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

    // -- Batchable / conflict tests --

    #[test]
    fn same_slot_owner_conflicts() {
        let a = SideEffectCommand::CreateNote {
            value: 1,
            owner: 0,
            storage_slot: 5,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::CreateNote {
            value: 2,
            owner: 0,
            storage_slot: 5,
            from: 1,
            via_parent: false,
        };
        assert!(a.conflicts(&b));
    }

    #[test]
    fn different_slot_no_conflict() {
        let a = SideEffectCommand::CreateNote {
            value: 1,
            owner: 0,
            storage_slot: 5,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::CreateNote {
            value: 2,
            owner: 0,
            storage_slot: 6,
            from: 0,
            via_parent: false,
        };
        assert!(!a.conflicts(&b));
    }

    #[test]
    fn different_owner_no_conflict() {
        let a = SideEffectCommand::CreateNote {
            value: 1,
            owner: 0,
            storage_slot: 5,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::CreateNote {
            value: 2,
            owner: 1,
            storage_slot: 5,
            from: 0,
            via_parent: false,
        };
        assert!(!a.conflicts(&b));
    }

    #[test]
    fn same_nullifier_conflicts() {
        let a = SideEffectCommand::EmitNullifier {
            nullifier: 42,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::EmitNullifier {
            nullifier: 42,
            from: 1,
            via_parent: false,
        };
        assert!(a.conflicts(&b));
    }

    #[test]
    fn different_nullifier_no_conflict() {
        let a = SideEffectCommand::EmitNullifier {
            nullifier: 42,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::EmitNullifier {
            nullifier: 99,
            from: 0,
            via_parent: false,
        };
        assert!(!a.conflicts(&b));
    }

    #[test]
    fn emit_and_test_nullifier_same_value_conflicts() {
        let a = SideEffectCommand::EmitNullifier {
            nullifier: 42,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::TestNullifierInclusion {
            nullifier: 42,
            from: 1,
            via_parent: false,
        };
        assert!(a.conflicts(&b));
    }

    #[test]
    fn note_and_nullifier_no_conflict() {
        let a = SideEffectCommand::CreateNote {
            value: 1,
            owner: 0,
            storage_slot: 5,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::EmitNullifier {
            nullifier: 42,
            from: 0,
            via_parent: false,
        };
        assert!(!a.conflicts(&b));
    }

    #[test]
    fn query_conflicts_with_send() {
        let query = SideEffectCommand::ViewNotesMany {
            owner: 0,
            storage_slot: 1,
            active_or_nullified: false,
            offset: 0,
            from: 0,
        };
        let send = SideEffectCommand::CreateNote {
            value: 1,
            owner: 1,
            storage_slot: 2,
            from: 0,
            via_parent: false,
        };
        assert!(query.conflicts(&send));
        assert!(send.conflicts(&query));
    }

    #[test]
    fn queries_do_not_conflict() {
        let a = SideEffectCommand::ViewNotesMany {
            owner: 0,
            storage_slot: 1,
            active_or_nullified: false,
            offset: 0,
            from: 0,
        };
        let b = SideEffectCommand::TestNoteInclusion {
            owner: 1,
            storage_slot: 2,
            from: 1,
            via_parent: false,
        };
        assert!(!a.conflicts(&b));
    }

    fn make_state() -> SideEffectState {
        SideEffectState {
            accounts: vec![0, 1, 2],
            storage_slots: vec![1, 5, 10],
            ..Default::default()
        }
    }

    fn machine() -> SideEffectMachine<'static> {
        SideEffectMachine {
            storage_slots: 5,
            bridge: None,
            artifacts_dir: "/tmp".into(),
        }
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
            from: 1,
            via_parent: false,
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
            via_parent: false,
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
            via_parent: false,
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
            via_parent: false,
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
                owner: 0,
                storage_slot: 5,
                active_or_nullified: true,
                offset: 0,
                from: 0,
            },
            SideEffectCommand::GetNotesMany {
                owner: 0,
                storage_slot: 5,
                active_or_nullified: true,
                offset: 0,
                from: 0,
            },
            SideEffectCommand::TestNoteInclusion {
                owner: 0,
                storage_slot: 5,
                from: 0,
                via_parent: false,
            },
            SideEffectCommand::TestNullifierInclusion {
                nullifier: 99,
                from: 0,
                via_parent: false,
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

        let result = expected_notes(&state, 5, 0, false, 0);
        assert_eq!(result, vec![10, 20]);
    }

    #[test]
    fn expected_notes_active_or_nullified() {
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![10, 20]);
        state.destroyed_notes.insert((5, 0), vec![30]);

        let result = expected_notes(&state, 5, 0, true, 0);
        assert_eq!(result, vec![10, 20, 30]);
    }

    #[test]
    fn expected_notes_empty_slot() {
        let state = make_state();
        assert!(expected_notes(&state, 5, 0, false, 0).is_empty());
        assert!(expected_notes(&state, 5, 0, true, 0).is_empty());
    }

    #[test]
    fn expected_notes_with_offset() {
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![10, 20, 30, 40]);

        // Skip first 2 notes (10, 20), expect [30, 40]
        let result = expected_notes(&state, 5, 0, false, 2);
        assert_eq!(result, vec![30, 40]);

        // Offset beyond available notes returns empty
        let result = expected_notes(&state, 5, 0, false, 10);
        assert!(result.is_empty());
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
    fn check_multi_note_values_match_prefix() {
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
    #[should_panic(expected = "returned values don't match expected prefix")]
    fn check_multi_note_wrong_value() {
        let output = "Simulation result:  [ 10n, 99n ]";
        check_multi_note_query("Test", 5, 0, output, &[10, 20]);
    }

    #[test]
    #[should_panic(expected = "returned values don't match expected prefix")]
    fn check_multi_note_wrong_order() {
        // Contract returns [20, 30] but expected prefix is [10, 20]
        let output = "Simulation result:  [ 20n, 30n ]";
        check_multi_note_query("Test", 5, 0, output, &[10, 20, 30]);
    }

    #[test]
    #[should_panic(expected = "returned values don't match expected prefix")]
    fn check_multi_note_missing_expected() {
        let output = "Simulation result:  [ 0n, 0n ]";
        check_multi_note_query("Test", 5, 0, output, &[10]);
    }

    #[test]
    fn check_multi_note_both_zero_when_none_expected() {
        let output = "Simulation result:  [ 0n, 0n ]";
        check_multi_note_query("Test", 5, 0, output, &[]);
    }

    /// Sequential destroys remove notes in ascending value order.
    #[test]
    fn sequential_destroys_remove_in_ascending_order() {
        let m = machine();
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![10, 20, 30]);

        let destroy = SideEffectCommand::DestroyNote {
            owner: 0,
            storage_slot: 5,
            from: 0,
            via_parent: false,
        };

        // First destroy: removes 10 (smallest)
        let state = m.next_state(&destroy, state);
        assert_eq!(state.active_notes[&(5, 0)], vec![20, 30]);
        assert_eq!(state.destroyed_notes[&(5, 0)], vec![10]);

        // Second destroy: removes 20 (now smallest)
        let state = m.next_state(&destroy, state);
        assert_eq!(state.active_notes[&(5, 0)], vec![30]);
        assert_eq!(state.destroyed_notes[&(5, 0)], vec![10, 20]);

        // Third destroy: removes 30 (last one)
        let state = m.next_state(&destroy, state);
        assert!(state.active_notes[&(5, 0)].is_empty());
        assert_eq!(state.destroyed_notes[&(5, 0)], vec![10, 20, 30]);
    }

    /// Destroy removes smallest value, regardless of insertion order.
    #[test]
    fn destroy_removes_smallest_value() {
        let m = machine();
        let state = make_state();

        // Insert 200 then 100 -- insertion order != value order
        let state = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 200,
                owner: 2,
                storage_slot: 14,
                from: 0,
                via_parent: false,
            },
            state,
        );
        let state = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 100,
                owner: 2,
                storage_slot: 14,
                from: 0,
                via_parent: false,
            },
            state,
        );

        // Sorted: [100, 200]; destroy removes 100
        let state = m.next_state(
            &SideEffectCommand::DestroyNote {
                owner: 2,
                storage_slot: 14,
                from: 2,
                via_parent: false,
            },
            state,
        );

        assert_eq!(state.active_notes[&(14, 2)], vec![200]);
        assert_eq!(state.destroyed_notes[&(14, 2)], vec![100]);

        let active = expected_notes(&state, 14, 2, false, 0);
        assert_eq!(active, vec![200]);

        let all = expected_notes(&state, 14, 2, true, 0);
        assert_eq!(all, vec![100, 200]);
    }

    /// Destroyed notes visible with `active_or_nullified=true`, hidden with `false`.
    #[test]
    fn destroyed_notes_visible_with_active_or_nullified_flag() {
        let m = machine();
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![10, 20, 30]);

        let state = m.next_state(
            &SideEffectCommand::DestroyNote {
                owner: 0,
                storage_slot: 5,
                from: 0,
                via_parent: false,
            },
            state,
        );

        // active_or_nullified=false: only active notes
        let active = expected_notes(&state, 5, 0, false, 0);
        assert_eq!(active, vec![20, 30]);
        assert!(!active.contains(&10));

        // active_or_nullified=true: active + destroyed
        let all = expected_notes(&state, 5, 0, true, 0);
        assert!(all.contains(&10));
        assert!(all.contains(&20));
        assert!(all.contains(&30));
    }

    /// Duplicate nullifier emit is idempotent in the model (HashSet).
    #[test]
    fn duplicate_nullifier_is_idempotent_in_model() {
        let m = machine();
        let state = make_state();

        let state = m.next_state(
            &SideEffectCommand::EmitNullifier {
                nullifier: 42,
                from: 0,
                via_parent: false,
            },
            state,
        );
        assert!(state.emitted_nullifiers.contains(&42));

        // Same value again -- still in the set
        let state = m.next_state(
            &SideEffectCommand::EmitNullifier {
                nullifier: 42,
                from: 1,
                via_parent: false,
            },
            state,
        );
        assert!(state.emitted_nullifiers.contains(&42));
    }

    /// Different owners on the same slot are independent.
    #[test]
    fn notes_are_per_owner() {
        let m = machine();
        let state = make_state();

        let state = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 10,
                owner: 0,
                storage_slot: 5,
                from: 0,
                via_parent: false,
            },
            state,
        );
        let state = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 20,
                owner: 1,
                storage_slot: 5,
                from: 0,
                via_parent: false,
            },
            state,
        );

        assert_eq!(expected_notes(&state, 5, 0, false, 0), vec![10]);
        assert_eq!(expected_notes(&state, 5, 1, false, 0), vec![20]);
        assert!(expected_notes(&state, 5, 2, false, 0).is_empty());
    }

    /// Same owner on different slots are independent.
    #[test]
    fn notes_are_per_slot() {
        let m = machine();
        let state = make_state();

        let state = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 10,
                owner: 0,
                storage_slot: 1,
                from: 0,
                via_parent: false,
            },
            state,
        );
        let state = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 20,
                owner: 0,
                storage_slot: 5,
                from: 0,
                via_parent: false,
            },
            state,
        );

        assert_eq!(expected_notes(&state, 1, 0, false, 0), vec![10]);
        assert_eq!(expected_notes(&state, 5, 0, false, 0), vec![20]);
    }

    /// CreateNote and CreateAndCompletePartialNote produce equivalent model state.
    #[test]
    fn create_and_partial_create_are_equivalent_in_model() {
        let m = machine();

        let state1 = m.next_state(
            &SideEffectCommand::CreateNote {
                value: 42,
                owner: 0,
                storage_slot: 5,
                from: 1,
                via_parent: false,
            },
            make_state(),
        );

        let state2 = m.next_state(
            &SideEffectCommand::CreateAndCompletePartialNote {
                owner: 0,
                storage_slot: 5,
                value: 42,
                from: 1,
            },
            make_state(),
        );

        assert_eq!(state1.active_notes, state2.active_notes);
    }
}
