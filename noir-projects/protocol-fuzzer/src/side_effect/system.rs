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
            query: cmd.is_query(),
            method,
            contract: contract.to_string(),
            from,
            args,
        })
    }
}

impl SideEffectSystem {
    pub(crate) fn execute_command(&self, cmd: &SideEffectCommand) -> anyhow::Result<String> {
        wallet::execute(&WalletCommand::try_from(cmd)?)
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
        Self {
            side_effect_artifact: "/tmp/side_effect_contract-SideEffect.json".to_string(),
            parent_artifact: "/tmp/parent_contract-Parent.json".to_string(),
        }
    }
}
