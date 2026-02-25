use super::machine::SideEffectCommand;
use crate::wallet::{self, AccountId, WalletCommand};

pub struct SideEffectSystem {
    side_effect_artifact: String,
    parent_artifact: String,
}

const CHILD_CONTRACT: &str = "contracts:test0";
const PARENT_CONTRACT: &str = "contracts:parent0";

impl TryFrom<&SideEffectCommand> for WalletCommand {
    type Error = anyhow::Error;

    fn try_from(cmd: &SideEffectCommand) -> anyhow::Result<Self> {
        use SideEffectCommand::*;
        let (verb, method, from, args) = match cmd {
            CreateNote {
                value,
                owner,
                storage_slot,
                from,
                ..
            } => (
                "send",
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
                "send",
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
                "simulate",
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
                "simulate",
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
                "send",
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
                "send",
                "test_note_inclusion",
                format!("accounts:test{from}"),
                vec![format!("accounts:test{owner}"), format!("{storage_slot}")],
            ),
            EmitNullifier {
                nullifier, from, ..
            } => (
                "send",
                "emit_nullifier",
                format!("accounts:test{from}"),
                vec![format!("{nullifier}")],
            ),
            TestNullifierInclusion {
                nullifier, from, ..
            } => (
                "send",
                "test_nullifier_inclusion",
                format!("accounts:test{from}"),
                vec![format!("{nullifier}")],
            ),
        };

        let (contract, method, args) = if cmd.via_parent() {
            (
                PARENT_CONTRACT,
                format!("forward_{method}"),
                [vec![CHILD_CONTRACT.to_string()], args].concat(),
            )
        } else {
            (CHILD_CONTRACT, method.to_string(), args)
        };

        Ok(WalletCommand {
            verb: verb.to_string(),
            method,
            contract: contract.to_string(),
            from,
            args,
        })
    }
}

impl SideEffectSystem {
    pub(crate) fn execute_command(&self, cmd: &SideEffectCommand) -> anyhow::Result<String> {
        let wallet_cmd = WalletCommand::try_from(cmd)?;
        wallet::execute(&wallet_cmd)
    }

    pub(crate) fn deploy_side_effect_contract(&self, account: AccountId) -> anyhow::Result<String> {
        wallet::deploy(
            &self.side_effect_artifact,
            &format!("accounts:test{account}"),
            "test0",
            Some("initialize"),
            None,
        )
    }

    pub(crate) fn deploy_parent_contract(&self, account: AccountId) -> anyhow::Result<String> {
        wallet::deploy(
            &self.parent_artifact,
            &format!("accounts:test{account}"),
            "parent0",
            Some("initialize"),
            None,
        )
    }

    pub(crate) fn new() -> Self {
        let side_effect_artifact = std::env::var("SIDE_EFFECT_ARTIFACT_PATH")
            .unwrap_or_else(|_| "/tmp/side_effect_contract-SideEffect.json".to_string());
        let parent_artifact = std::env::var("PARENT_ARTIFACT_PATH")
            .unwrap_or_else(|_| "/tmp/parent_contract-Parent.json".to_string());
        Self {
            side_effect_artifact,
            parent_artifact,
        }
    }
}
