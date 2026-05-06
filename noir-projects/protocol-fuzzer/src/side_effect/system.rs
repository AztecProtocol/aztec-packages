use super::machine::SideEffectCommand;
use crate::wallet::{AccountId, Bridge, WalletCommand};

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
            } => (
                "call_view_notes_many",
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{owner}"),
                    format!("{storage_slot}"),
                    format!("{active_or_nullified}"),
                    format!("{offset}"),
                ],
            ),
            GetNotesMany {
                owner,
                storage_slot,
                active_or_nullified,
                offset,
                from,
            } => (
                "call_get_notes_many",
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
            } => (
                "call_destroy_note",
                format!("accounts:test{from}"),
                vec![format!("accounts:test{owner}"), format!("{storage_slot}")],
            ),
            TestNoteInclusion {
                owner,
                storage_slot,
                from,
                ..
            } => (
                "test_note_inclusion",
                format!("accounts:test{from}"),
                vec![format!("accounts:test{owner}"), format!("{storage_slot}")],
            ),
            EmitNullifier {
                nullifier, from, ..
            } => (
                "emit_nullifier",
                format!("accounts:test{from}"),
                vec![format!("{nullifier}")],
            ),
            TestNullifierInclusion {
                nullifier, from, ..
            } => (
                "test_settled_nullifier_inclusion",
                format!("accounts:test{from}"),
                vec![format!("{nullifier}")],
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
    pub(crate) fn execute_command(&self, cmd: &SideEffectCommand) -> anyhow::Result<String> {
        self.bridge.execute(&WalletCommand::from(cmd))
    }

    pub(crate) fn execute_command_batch(
        &self,
        cmds: &[SideEffectCommand],
    ) -> Vec<anyhow::Result<String>> {
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
