use std::collections::{HashMap, HashSet};

use anyhow::Result;
use arbitrary::{Arbitrary, Unstructured};
use log::debug;

use super::system::SideEffectSystem;
use crate::smt::{self, Batchable};
use crate::wallet::{self, AccountId, Bridge, ExecOutput};

pub(crate) type NoteValue = u128;
pub(crate) type NullifierValue = u128;
pub(crate) type StorageSlotId = u8;
pub(crate) type L2ToL1Content = u128;
pub(crate) type L2ToL1Recipient = u128;
pub(crate) type LogTag = u128;
pub(crate) type LogContent = u128;

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
    /// Include RequestOvskApp and TestSettingTeardown in the random command pool.
    /// These are "one-shot" kernel exercisers: they always succeed, have no
    /// parameters to vary meaningfully, and produce no model state. They are
    /// smoke-tested at setup (direct + via_parent) in `new_system()` to prove
    /// the kernel plumbing works; repeating them during fuzzing wastes ~5-13s
    /// per tx without finding new bugs. Enable with `--include-one-shots` for
    /// exhaustive runs.
    pub include_one_shots: bool,
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
    SendL2ToL1Message {
        content: L2ToL1Content,
        recipient: L2ToL1Recipient,
        from: AccountId,
        via_parent: bool,
    },
    EmitPrivateLog {
        tag: LogTag,
        content: LogContent,
        from: AccountId,
        via_parent: bool,
    },
    RequestOvskApp {
        from: AccountId,
        via_parent: bool,
    },
    TestSettingTeardown {
        from: AccountId,
        via_parent: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Category {
    Stateful,
    ReadOnlyQuery,
    AssertionQuery,
    KernelExerciser,
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
            Self::SendL2ToL1Message { .. } => "SendL2ToL1Message",
            Self::EmitPrivateLog { .. } => "EmitPrivateLog",
            Self::RequestOvskApp { .. } => "RequestOvskApp",
            Self::TestSettingTeardown { .. } => "TestSettingTeardown",
        }
    }

    /// Contract method (snake_case, as exported by the Noir contract).
    pub(crate) fn method_name(&self) -> &'static str {
        match self {
            Self::CreateNote { .. } => "call_create_note",
            Self::CreateAndCompletePartialNote { .. } => "call_create_and_complete_partial_note",
            Self::ViewNotesMany { .. } => "call_view_notes_many",
            Self::GetNotesMany { .. } => "call_get_notes_many",
            Self::DestroyNote { .. } => "call_destroy_note",
            Self::TestNoteInclusion { .. } => "test_note_inclusion",
            Self::EmitNullifier { .. } => "emit_nullifier",
            Self::TestNullifierInclusion { .. } => "test_settled_nullifier_inclusion",
            Self::SendL2ToL1Message { .. } => "send_l2_to_l1_message",
            Self::EmitPrivateLog { .. } => "emit_private_log",
            Self::RequestOvskApp { .. } => "request_ovsk_app",
            Self::TestSettingTeardown { .. } => "test_setting_teardown",
        }
    }

    /// The account ID this command originates from (used as `msg_sender`).
    pub(crate) fn from(&self) -> AccountId {
        match self {
            Self::CreateNote { from, .. }
            | Self::CreateAndCompletePartialNote { from, .. }
            | Self::ViewNotesMany { from, .. }
            | Self::GetNotesMany { from, .. }
            | Self::DestroyNote { from, .. }
            | Self::TestNoteInclusion { from, .. }
            | Self::EmitNullifier { from, .. }
            | Self::TestNullifierInclusion { from, .. }
            | Self::SendL2ToL1Message { from, .. }
            | Self::EmitPrivateLog { from, .. }
            | Self::RequestOvskApp { from, .. }
            | Self::TestSettingTeardown { from, .. } => *from,
        }
    }

    /// Bucket each command falls into. Predicates below derive from this so a
    /// new variant only needs adding here and to the per-field extractors.
    ///
    /// - `Stateful`        -- changes model state; sends a tx; batchable.
    /// - `ReadOnlyQuery`   -- simulates locally; flushes batch to observe prior writes.
    /// - `AssertionQuery`  -- sends a tx that asserts on committed state; flushes batch.
    /// - `KernelExerciser` -- sends a tx that exercises kernel plumbing (key
    ///   validation, public teardown); no model state, doesn't flush.
    pub(crate) fn category(&self) -> Category {
        match self {
            Self::CreateNote { .. }
            | Self::CreateAndCompletePartialNote { .. }
            | Self::DestroyNote { .. }
            | Self::EmitNullifier { .. }
            | Self::SendL2ToL1Message { .. }
            | Self::EmitPrivateLog { .. } => Category::Stateful,
            Self::ViewNotesMany { .. } | Self::GetNotesMany { .. } => Category::ReadOnlyQuery,
            Self::TestNoteInclusion { .. } | Self::TestNullifierInclusion { .. } => {
                Category::AssertionQuery
            }
            Self::RequestOvskApp { .. } | Self::TestSettingTeardown { .. } => {
                Category::KernelExerciser
            }
        }
    }

    pub fn verb(&self) -> wallet::Verb {
        match self.category() {
            Category::ReadOnlyQuery => wallet::Verb::Simulate,
            _ => wallet::Verb::Send,
        }
    }

    pub fn flushes_batch(&self) -> bool {
        matches!(
            self.category(),
            Category::ReadOnlyQuery | Category::AssertionQuery
        )
    }

    pub fn changes_model(&self) -> bool {
        matches!(self.category(), Category::Stateful)
    }

    pub(crate) fn via_parent(&self) -> bool {
        match self {
            Self::CreateNote { via_parent, .. }
            | Self::DestroyNote { via_parent, .. }
            | Self::TestNoteInclusion { via_parent, .. }
            | Self::EmitNullifier { via_parent, .. }
            | Self::TestNullifierInclusion { via_parent, .. }
            | Self::SendL2ToL1Message { via_parent, .. }
            | Self::EmitPrivateLog { via_parent, .. }
            | Self::RequestOvskApp { via_parent, .. }
            | Self::TestSettingTeardown { via_parent, .. } => *via_parent,
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
            | Self::TestNullifierInclusion { .. }
            | Self::SendL2ToL1Message { .. }
            | Self::EmitPrivateLog { .. }
            | Self::RequestOvskApp { .. }
            | Self::TestSettingTeardown { .. } => None,
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
            | Self::GetNotesMany { .. }
            | Self::SendL2ToL1Message { .. }
            | Self::EmitPrivateLog { .. }
            | Self::RequestOvskApp { .. }
            | Self::TestSettingTeardown { .. } => None,
        }
    }
}

impl Batchable for SideEffectCommand {
    fn conflicts(&self, other: &Self) -> bool {
        // Two batch-flushing commands don't conflict (both observe committed state
        // without interfering), but a flushing + non-flushing pair conflicts (the
        // flushing command must see prior writes).
        if self.flushes_batch() || other.flushes_batch() {
            return !(self.flushes_batch() && other.flushes_batch());
        }

        // Same (slot, owner) pair -> conflict.
        if let (Some(a), Some(b)) = (self.slot_owner(), other.slot_owner())
            && a == b
        {
            return true;
        }

        // Same nullifier value -> conflict (EmitNullifier(x) vs EmitNullifier(x)
        // or TestNullifierInclusion(x)). Conservative: Test could in principle
        // batch after Emit, but we don't model the ordering -- the cost is just
        // smaller batches, not correctness.
        if let (Some(a), Some(b)) = (self.nullifier_val(), other.nullifier_val())
            && a == b
        {
            return true;
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
    pub l2_to_l1_messages: Vec<(L2ToL1Content, L2ToL1Recipient)>,
    pub private_logs: Vec<(LogTag, LogContent)>,
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

fn assert_expected(name: &str, expect_ok: bool, result: &anyhow::Result<ExecOutput>) {
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
    type Result = Result<ExecOutput>;

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

        // Weighted command generation. Three tiers of fuzzing value:
        //
        // 1. HIGH VALUE -- stateful, with failure paths:
        //    Notes (create/destroy/query/inclusion) and nullifiers (emit/inclusion).
        //    These maintain model state and verify it against sandbox queries.
        //    Failure paths (empty-slot destroy, duplicate nullifier) are exercised
        //    naturally as the random state evolves.
        //
        // 2. MEANINGFUL -- always succeed, per-command verification:
        //    L2->L1 messages and private logs. Always succeed (no preconditions).
        //    L2->L1 message hash checked against TxEffect when available; private
        //    log discoverable via siloed tag with correct content, plus per-tag
        //    completeness against the model.
        //
        // 3. ONE-SHOT -- success-only, no model state (opt-in via --include-one-shots):
        //    RequestOvskApp and TestSettingTeardown. Always succeed with no
        //    parameters to vary meaningfully. Smoke-tested at setup (direct +
        //    via_parent) in new_system(); repeating during fuzzing wastes tx
        //    budget.
        let mut choices = crate::util::weighted_choices(&[
            ("create_note", 8),
            ("create_partial_note", 3),
            ("emit_nullifier", 3),
            ("send_l2_to_l1_message", 3),
            ("emit_private_log", 3),
        ]);

        if self.include_one_shots {
            choices.extend(crate::util::weighted_choices(&[
                ("request_ovsk_app", 2),
                ("test_setting_teardown", 2),
            ]));
        }

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
            "send_l2_to_l1_message" => SideEffectCommand::SendL2ToL1Message {
                content: u128::arbitrary(u)?,
                recipient: u128::arbitrary(u)?,
                from: choose_account(u, state)?,
                via_parent: bool::arbitrary(u)?,
            },
            "emit_private_log" => SideEffectCommand::EmitPrivateLog {
                tag: u128::arbitrary(u)?,
                content: u128::arbitrary(u)?,
                from: choose_account(u, state)?,
                via_parent: bool::arbitrary(u)?,
            },
            "request_ovsk_app" => SideEffectCommand::RequestOvskApp {
                from: choose_account(u, state)?,
                via_parent: bool::arbitrary(u)?,
            },
            "test_setting_teardown" => SideEffectCommand::TestSettingTeardown {
                from: choose_account(u, state)?,
                via_parent: bool::arbitrary(u)?,
            },
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
            .run_one_shot_smoke_tests()
            .expect("one-shot smoke tests failed");
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
                if let Some(notes) = state.active_notes.get_mut(&key)
                    && !notes.is_empty()
                {
                    // Contract sorts by value ASC, destroys get(0) (smallest).
                    let value = notes.remove(0);
                    state.destroyed_notes.entry(key).or_default().push(value);
                }
            }
            EmitNullifier { nullifier, .. } => {
                state.emitted_nullifiers.insert(*nullifier);
            }
            SendL2ToL1Message {
                content, recipient, ..
            } => {
                state.l2_to_l1_messages.push((*content, *recipient));
            }
            EmitPrivateLog { tag, content, .. } => {
                state.private_logs.push((*tag, *content));
            }
            ViewNotesMany { .. }
            | GetNotesMany { .. }
            | TestNoteInclusion { .. }
            | TestNullifierInclusion { .. }
            | RequestOvskApp { .. }
            | TestSettingTeardown { .. } => {
                debug_assert!(!cmd.changes_model());
            }
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

    /// Verify the sandbox result against the model. Per-`Category` strategy:
    ///
    /// - **Stateful**:
    ///   - Notes: success/failure checked here; values verified transitively
    ///     by subsequent View/GetNotesMany.
    ///   - Nullifiers: success + duplicate detection; insertion verified
    ///     transitively by TestNullifierInclusion.
    ///   - L2->L1 messages: reconstruct the expected hash (via bridge) and
    ///     check it appears in TxEffect (same check an L1 contract performs).
    ///   - Private logs: compute the siloed tag, query the node, and verify
    ///     the just-emitted content is discoverable AND every previously-emitted
    ///     log with the same tag is still present (per-tag completeness).
    ///     `emit_private_log_unsafe` uses plaintext tags, so we verify siloing
    ///     + indexing, not the full ECDH discovery protocol.
    /// - **ReadOnlyQuery** (View/GetNotesMany): compare returned values to the
    ///   model's expected notes.
    /// - **AssertionQuery** (TestNote/NullifierInclusion): expect the tx to
    ///   succeed iff the asserted condition holds in the model.
    /// - **KernelExerciser** (RequestOvskApp/TestSettingTeardown): success-only;
    ///   success proves the kernel plumbing works.
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
                debug!(
                    "{} value={value} owner={owner} slot={storage_slot}",
                    cmd.name()
                );
                assert_expected(cmd.name(), true, &result);
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
            SendL2ToL1Message {
                content, recipient, ..
            } => {
                assert_expected(cmd.name(), true, &result);
                // Recipient-side verification requires the bridge (to compute the
                // expected hash) and TxEffect data (extracted from the receipt by
                // the bridge). Either being absent silently skips this check --
                // unit tests run without a bridge, and the bridge may fail to fetch
                // TxEffect if the block isn't indexed yet.
                if let Some(bridge) = self.bridge {
                    let output = result.as_ref().unwrap();
                    if let Some(ref effects) = output.tx_effects {
                        // All sends originate from the SideEffect contract deployed
                        // under the `test0` alias (see `deploy_side_effect_contract`).
                        let contract = bridge.resolve("contracts:test0");
                        let expected_hash = bridge
                            .compute_l2_to_l1_hash(
                                &contract,
                                &recipient.to_string(),
                                &content.to_string(),
                            )
                            .expect("compute_l2_to_l1_hash failed");
                        let found = effects.l2_to_l1_msg_hashes.contains(&expected_hash);
                        assert!(
                            found,
                            "{}: expected L2->L1 msg hash {} not in TxEffect hashes {:?}",
                            cmd.name(),
                            expected_hash,
                            effects.l2_to_l1_msg_hashes,
                        );
                    }
                }
            }
            EmitPrivateLog { tag, content, .. } => {
                assert_expected(cmd.name(), true, &result);
                if let Some(bridge) = self.bridge {
                    let contract = bridge.resolve("contracts:test0");
                    let logs = bridge
                        .query_private_logs(&contract, &tag.to_string())
                        .expect("query_private_logs failed");

                    // Verify the just-emitted log is discoverable.
                    // log_data[0] = siloed tag (matched by the query), log_data[1] = content
                    let content_str = content.to_string();
                    let found = logs
                        .iter()
                        .any(|log| log.log_data.len() >= 2 && log.log_data[1] == content_str);
                    assert!(
                        found,
                        "{}: log with tag={tag} content={content} not found via siloed tag query. \
                         logs={:?}",
                        cmd.name(),
                        logs,
                    );

                    // Verify per-tag completeness: every log the model has previously
                    // emitted with this tag should still be discoverable. This catches
                    // issues where the node drops or overwrites earlier logs.
                    // (pre_state does NOT include the current emission -- that's added
                    // by next_state after check_result returns.)
                    let prior_contents: Vec<String> = pre_state
                        .private_logs
                        .iter()
                        .filter(|(t, _)| *t == *tag)
                        .map(|(_, c)| c.to_string())
                        .collect();
                    for expected_content in &prior_contents {
                        let still_present = logs.iter().any(|log| {
                            log.log_data.len() >= 2 && log.log_data[1] == *expected_content
                        });
                        assert!(
                            still_present,
                            "{}: prior log with tag={tag} content={expected_content} no longer \
                             discoverable after emitting content={content}. logs={:?}",
                            cmd.name(),
                            logs,
                        );
                    }
                }
            }
            RequestOvskApp { .. } | TestSettingTeardown { .. } => {
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
                assert_expected(cmd.name(), true, &result);
                let expected = expected_notes(
                    pre_state,
                    *storage_slot,
                    *owner,
                    *active_or_nullified,
                    *offset,
                );
                check_multi_note_query(
                    cmd.name(),
                    *storage_slot,
                    *owner,
                    &result.unwrap().stdout,
                    &expected,
                );
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
            include_one_shots: false,
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

    // -- SendL2ToL1Message / EmitPrivateLog tests --

    #[test]
    fn send_l2_to_l1_message_tracks_in_model() {
        let m = machine();
        let state = make_state();
        let cmd = SideEffectCommand::SendL2ToL1Message {
            content: 123,
            recipient: 456,
            from: 0,
            via_parent: false,
        };
        let state = m.next_state(&cmd, state);
        assert_eq!(state.l2_to_l1_messages, vec![(123, 456)]);
    }

    #[test]
    fn emit_private_log_tracks_in_model() {
        let m = machine();
        let state = make_state();
        let cmd = SideEffectCommand::EmitPrivateLog {
            tag: 10,
            content: 20,
            from: 1,
            via_parent: false,
        };
        let state = m.next_state(&cmd, state);
        assert_eq!(state.private_logs, vec![(10, 20)]);
    }

    #[test]
    /// L2->L1 and private-log sends mutate their own model lists but must not
    /// pollute note or nullifier state. (Kernel exercisers are covered by
    /// `kernel_exercisers_dont_change_any_state`, which is strictly stronger.)
    fn l2_to_l1_and_private_log_dont_touch_note_or_nullifier_state() {
        let m = machine();
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![42]);
        state.emitted_nullifiers.insert(99);

        let cmds = vec![
            SideEffectCommand::SendL2ToL1Message {
                content: 1,
                recipient: 2,
                from: 0,
                via_parent: false,
            },
            SideEffectCommand::EmitPrivateLog {
                tag: 3,
                content: 4,
                from: 0,
                via_parent: false,
            },
        ];

        for cmd in &cmds {
            let new_state = m.next_state(cmd, state.clone());
            assert_eq!(new_state.active_notes, state.active_notes);
            assert_eq!(new_state.destroyed_notes, state.destroyed_notes);
            assert_eq!(new_state.emitted_nullifiers, state.emitted_nullifiers);
        }
    }

    #[test]
    fn l2_to_l1_messages_dont_conflict_with_each_other() {
        let a = SideEffectCommand::SendL2ToL1Message {
            content: 1,
            recipient: 2,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::SendL2ToL1Message {
            content: 3,
            recipient: 4,
            from: 1,
            via_parent: false,
        };
        assert!(!a.conflicts(&b));
    }

    #[test]
    fn private_logs_dont_conflict_with_each_other() {
        let a = SideEffectCommand::EmitPrivateLog {
            tag: 1,
            content: 2,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::EmitPrivateLog {
            tag: 3,
            content: 4,
            from: 1,
            via_parent: false,
        };
        assert!(!a.conflicts(&b));
    }

    #[test]
    fn l2_to_l1_and_note_dont_conflict() {
        let a = SideEffectCommand::SendL2ToL1Message {
            content: 1,
            recipient: 2,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::CreateNote {
            value: 42,
            owner: 0,
            storage_slot: 5,
            from: 0,
            via_parent: false,
        };
        assert!(!a.conflicts(&b));
    }

    #[test]
    fn private_log_and_nullifier_dont_conflict() {
        let a = SideEffectCommand::EmitPrivateLog {
            tag: 1,
            content: 2,
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
    fn l2_to_l1_conflicts_with_query() {
        let a = SideEffectCommand::SendL2ToL1Message {
            content: 1,
            recipient: 2,
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::ViewNotesMany {
            owner: 0,
            storage_slot: 1,
            active_or_nullified: false,
            offset: 0,
            from: 0,
        };
        assert!(a.conflicts(&b));
        assert!(b.conflicts(&a));
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

    // -- RequestOvskApp / TestSettingTeardown conflict tests --

    #[test]
    fn request_ovsk_app_no_conflict_with_send() {
        let a = SideEffectCommand::RequestOvskApp {
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::CreateNote {
            value: 1,
            owner: 0,
            storage_slot: 5,
            from: 0,
            via_parent: false,
        };
        assert!(!a.conflicts(&b));
    }

    #[test]
    fn teardown_no_conflict_with_send() {
        let a = SideEffectCommand::TestSettingTeardown {
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::CreateNote {
            value: 1,
            owner: 0,
            storage_slot: 5,
            from: 0,
            via_parent: false,
        };
        assert!(!a.conflicts(&b));
    }

    #[test]
    fn request_ovsk_app_conflicts_with_query() {
        let a = SideEffectCommand::RequestOvskApp {
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::ViewNotesMany {
            owner: 0,
            storage_slot: 1,
            active_or_nullified: false,
            offset: 0,
            from: 0,
        };
        assert!(a.conflicts(&b));
        assert!(b.conflicts(&a));
    }

    #[test]
    fn teardown_conflicts_with_query() {
        let a = SideEffectCommand::TestSettingTeardown {
            from: 0,
            via_parent: false,
        };
        let b = SideEffectCommand::ViewNotesMany {
            owner: 0,
            storage_slot: 1,
            active_or_nullified: false,
            offset: 0,
            from: 0,
        };
        assert!(a.conflicts(&b));
        assert!(b.conflicts(&a));
    }

    // -- Category -> predicate derivation --
    //
    // The exhaustive match in `category()` guarantees every variant is bucketed;
    // these cases confirm each bucket maps to the right (changes_model,
    // flushes_batch, verb) triple. One representative per bucket is enough.

    #[test]
    fn category_predicates() {
        let cases: &[(SideEffectCommand, Category, bool, bool, wallet::Verb)] = &[
            (
                SideEffectCommand::CreateNote {
                    value: 1,
                    owner: 0,
                    storage_slot: 1,
                    from: 0,
                    via_parent: false,
                },
                Category::Stateful,
                true,
                false,
                wallet::Verb::Send,
            ),
            (
                SideEffectCommand::ViewNotesMany {
                    owner: 0,
                    storage_slot: 1,
                    active_or_nullified: false,
                    offset: 0,
                    from: 0,
                },
                Category::ReadOnlyQuery,
                false,
                true,
                wallet::Verb::Simulate,
            ),
            (
                SideEffectCommand::TestNoteInclusion {
                    owner: 0,
                    storage_slot: 1,
                    from: 0,
                    via_parent: false,
                },
                Category::AssertionQuery,
                false,
                true,
                wallet::Verb::Send,
            ),
            (
                SideEffectCommand::RequestOvskApp {
                    from: 0,
                    via_parent: false,
                },
                Category::KernelExerciser,
                false,
                false,
                wallet::Verb::Send,
            ),
        ];
        for (cmd, cat, changes, flushes, verb) in cases {
            assert_eq!(cmd.category(), *cat, "{}: category", cmd.name());
            assert_eq!(
                cmd.changes_model(),
                *changes,
                "{}: changes_model",
                cmd.name()
            );
            assert_eq!(
                cmd.flushes_batch(),
                *flushes,
                "{}: flushes_batch",
                cmd.name()
            );
            assert!(
                matches!(
                    (cmd.verb(), verb),
                    (wallet::Verb::Send, wallet::Verb::Send)
                        | (wallet::Verb::Simulate, wallet::Verb::Simulate)
                ),
                "{}: verb",
                cmd.name()
            );
        }
    }

    // -- L2->L1 / private log accumulation tests --

    #[test]
    fn multiple_l2_to_l1_messages_accumulate() {
        let m = machine();
        let state = make_state();
        let state = m.next_state(
            &SideEffectCommand::SendL2ToL1Message {
                content: 10,
                recipient: 20,
                from: 0,
                via_parent: false,
            },
            state,
        );
        let state = m.next_state(
            &SideEffectCommand::SendL2ToL1Message {
                content: 30,
                recipient: 40,
                from: 1,
                via_parent: false,
            },
            state,
        );
        assert_eq!(state.l2_to_l1_messages, vec![(10, 20), (30, 40)]);
    }

    #[test]
    fn multiple_private_logs_accumulate() {
        let m = machine();
        let state = make_state();
        let state = m.next_state(
            &SideEffectCommand::EmitPrivateLog {
                tag: 1,
                content: 2,
                from: 0,
                via_parent: false,
            },
            state,
        );
        let state = m.next_state(
            &SideEffectCommand::EmitPrivateLog {
                tag: 3,
                content: 4,
                from: 1,
                via_parent: false,
            },
            state,
        );
        assert_eq!(state.private_logs, vec![(1, 2), (3, 4)]);
    }

    #[test]
    fn private_logs_same_tag_accumulate() {
        let m = machine();
        let state = make_state();
        let state = m.next_state(
            &SideEffectCommand::EmitPrivateLog {
                tag: 42,
                content: 100,
                from: 0,
                via_parent: false,
            },
            state,
        );
        let state = m.next_state(
            &SideEffectCommand::EmitPrivateLog {
                tag: 42,
                content: 200,
                from: 0,
                via_parent: false,
            },
            state,
        );
        let state = m.next_state(
            &SideEffectCommand::EmitPrivateLog {
                tag: 99,
                content: 300,
                from: 0,
                via_parent: false,
            },
            state,
        );

        // Two logs under tag 42, one under tag 99.
        let tag42: Vec<_> = state
            .private_logs
            .iter()
            .filter(|(t, _)| *t == 42)
            .map(|(_, c)| *c)
            .collect();
        assert_eq!(tag42, vec![100, 200]);

        let tag99: Vec<_> = state
            .private_logs
            .iter()
            .filter(|(t, _)| *t == 99)
            .map(|(_, c)| *c)
            .collect();
        assert_eq!(tag99, vec![300]);
    }

    #[test]
    fn l2_to_l1_and_private_log_are_independent() {
        let m = machine();
        let state = make_state();
        let state = m.next_state(
            &SideEffectCommand::SendL2ToL1Message {
                content: 10,
                recipient: 20,
                from: 0,
                via_parent: false,
            },
            state,
        );
        let state = m.next_state(
            &SideEffectCommand::EmitPrivateLog {
                tag: 1,
                content: 2,
                from: 0,
                via_parent: false,
            },
            state,
        );
        assert_eq!(state.l2_to_l1_messages, vec![(10, 20)]);
        assert_eq!(state.private_logs, vec![(1, 2)]);
    }

    #[test]
    fn kernel_exercisers_dont_change_any_state() {
        let m = machine();
        let mut state = make_state();
        state.active_notes.insert((5, 0), vec![42]);
        state.emitted_nullifiers.insert(99);
        state.l2_to_l1_messages.push((1, 2));
        state.private_logs.push((3, 4));

        let cmds = vec![
            SideEffectCommand::RequestOvskApp {
                from: 0,
                via_parent: false,
            },
            SideEffectCommand::TestSettingTeardown {
                from: 0,
                via_parent: false,
            },
        ];

        for cmd in &cmds {
            let new_state = m.next_state(cmd, state.clone());
            assert_eq!(new_state.active_notes, state.active_notes, "{}", cmd.name());
            assert_eq!(
                new_state.destroyed_notes,
                state.destroyed_notes,
                "{}",
                cmd.name()
            );
            assert_eq!(
                new_state.emitted_nullifiers,
                state.emitted_nullifiers,
                "{}",
                cmd.name()
            );
            assert_eq!(
                new_state.l2_to_l1_messages,
                state.l2_to_l1_messages,
                "{}",
                cmd.name()
            );
            assert_eq!(new_state.private_logs, state.private_logs, "{}", cmd.name());
        }
    }
}
