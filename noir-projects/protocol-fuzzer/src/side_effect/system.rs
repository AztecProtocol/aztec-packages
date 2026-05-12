use super::machine::SideEffectCommand;
use crate::wallet::{AccountId, Bridge, ExecOutput, WalletCommand};

pub struct SideEffectSystem<'a> {
    side_effect_artifact: String,
    parent_artifact: String,
    bridge: &'a Bridge,
}

const CHILD_CONTRACT: &str = "contracts:test0";
const PARENT_CONTRACT: &str = "contracts:parent0";

impl From<&SideEffectCommand> for WalletCommand {
    fn from(cmd: &SideEffectCommand) -> Self {
        use SideEffectCommand::*;
        let (method, from, args) = match cmd {
            CreateNote {
                value,
                owner,
                storage_slot,
                from,
                ..
            } => (
                "call_create_note",
                format!("accounts:test{from}"),
                vec![
                    format!("{value}"),
                    format!("accounts:test{owner}"),
                    format!("{storage_slot}"),
                ],
            ),
            CreateAndCompletePartialNote {
                owner,
                storage_slot,
                value,
                from,
            } => (
                "call_create_and_complete_partial_note",
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{owner}"),
                    format!("{storage_slot}"),
                    format!("{value}"),
                ],
            ),
            ViewNotesMany {
                owner,
                storage_slot,
                active_or_nullified,
                offset,
                from,
            }
            | GetNotesMany {
                owner,
                storage_slot,
                active_or_nullified,
                offset,
                from,
            } => (
                if matches!(cmd, ViewNotesMany { .. }) {
                    "call_view_notes_many"
                } else {
                    "call_get_notes_many"
                },
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{owner}"),
                    format!("{storage_slot}"),
                    format!("{active_or_nullified}"),
                    format!("{offset}"),
                ],
            ),
            DestroyNote {
                owner,
                storage_slot,
                from,
                ..
            }
            | TestNoteInclusion {
                owner,
                storage_slot,
                from,
                ..
            } => (
                if matches!(cmd, DestroyNote { .. }) {
                    "call_destroy_note"
                } else {
                    "test_note_inclusion"
                },
                format!("accounts:test{from}"),
                vec![format!("accounts:test{owner}"), format!("{storage_slot}")],
            ),
            EmitNullifier {
                nullifier, from, ..
            }
            | TestNullifierInclusion {
                nullifier, from, ..
            } => (
                if matches!(cmd, EmitNullifier { .. }) {
                    "emit_nullifier"
                } else {
                    "test_settled_nullifier_inclusion"
                },
                format!("accounts:test{from}"),
                vec![format!("{nullifier}")],
            ),
            SendL2ToL1Message {
                content,
                recipient,
                from,
                ..
            } => (
                "send_l2_to_l1_message",
                format!("accounts:test{from}"),
                // EthAddress is a struct { inner: Field }; the CLI's encodeArg
                // expects a 0x-prefixed 32-byte hex string for single-field structs.
                vec![format!("{content}"), format!("0x{recipient:064x}")],
            ),
            EmitPrivateLog {
                tag, content, from, ..
            } => (
                "emit_private_log",
                format!("accounts:test{from}"),
                vec![format!("{tag}"), format!("{content}")],
            ),
            RequestOvskApp { from, .. } => (
                "request_ovsk_app",
                format!("accounts:test{from}"),
                // The argument is the owner whose ovsk_app we request; passing
                // `from` exercises the success path. A mismatched owner would
                // test the failure path (kernel rejects unauthorized derivation).
                vec![format!("accounts:test{from}")],
            ),
            TestSettingTeardown { from, .. } => (
                "test_setting_teardown",
                format!("accounts:test{from}"),
                vec![],
            ),
        };

        let (contract, method, args) = if cmd.via_parent() {
            let mut parent_args = vec![CHILD_CONTRACT.to_string()];
            parent_args.extend(args);
            (PARENT_CONTRACT, format!("forward_{method}"), parent_args)
        } else {
            (CHILD_CONTRACT, method.to_string(), args)
        };

        WalletCommand {
            verb: cmd.verb(),
            method,
            contract: contract.to_string(),
            from,
            args,
        }
    }
}

impl<'a> SideEffectSystem<'a> {
    pub(crate) fn execute_command(&self, cmd: &SideEffectCommand) -> anyhow::Result<ExecOutput> {
        self.bridge.execute(&WalletCommand::from(cmd))
    }

    pub(crate) fn execute_command_batch(
        &self,
        cmds: &[SideEffectCommand],
    ) -> Vec<anyhow::Result<ExecOutput>> {
        let wallet_cmds: Vec<WalletCommand> = cmds.iter().map(WalletCommand::from).collect();
        self.bridge.execute_many(&wallet_cmds)
    }

    pub(crate) fn deploy_side_effect_contract(&self, account: AccountId) -> anyhow::Result<String> {
        self.bridge.deploy(
            &self.side_effect_artifact,
            &format!("accounts:test{account}"),
            "test0",
            Some("initialize"),
            None,
        )
    }

    pub(crate) fn deploy_parent_contract(&self, account: AccountId) -> anyhow::Result<String> {
        self.bridge.deploy(
            &self.parent_artifact,
            &format!("accounts:test{account}"),
            "parent0",
            Some("initialize"),
            None,
        )
    }

    /// Smoke-test the kernel exercisers during setup: each is run both directly
    /// and via the parent contract (cross-contract enqueue is a different kernel
    /// call shape, so it needs its own check). They always succeed and have no
    /// parameters to vary, so once these four pass, repeating them during
    /// fuzzing wastes ~5-13s per redundant tx.
    pub(crate) fn run_one_shot_smoke_tests(&self) -> anyhow::Result<()> {
        let cmds = [
            SideEffectCommand::RequestOvskApp {
                from: 0,
                via_parent: false,
            },
            SideEffectCommand::TestSettingTeardown {
                from: 0,
                via_parent: false,
            },
            SideEffectCommand::RequestOvskApp {
                from: 0,
                via_parent: true,
            },
            SideEffectCommand::TestSettingTeardown {
                from: 0,
                via_parent: true,
            },
        ];
        for cmd in &cmds {
            self.execute_command(cmd)
                .map_err(|e| anyhow::anyhow!("one-shot smoke test {:?} failed: {e}", cmd))?;
        }
        Ok(())
    }

    pub(crate) fn new(bridge: &'a Bridge, artifacts_dir: &str) -> Self {
        let dir = std::path::Path::new(artifacts_dir)
            .canonicalize()
            .unwrap_or_else(|e| panic!("cannot resolve artifacts dir {artifacts_dir:?}: {e}"));
        let dir = dir.display();
        Self {
            side_effect_artifact: format!("{dir}/side_effect_contract-SideEffect.json"),
            parent_artifact: format!("{dir}/parent_contract-Parent.json"),
            bridge,
        }
    }
}
