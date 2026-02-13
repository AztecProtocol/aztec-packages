use super::machine::SideEffectCommand;
use crate::wallet::{self, AccountId, WalletCommand};

#[derive(Default)]
pub struct SideEffectSystem;

impl TryFrom<&SideEffectCommand> for WalletCommand {
    type Error = anyhow::Error;

    fn try_from(cmd: &SideEffectCommand) -> anyhow::Result<Self> {
        use SideEffectCommand::*;
        let (verb, method, from, args) = match cmd {
            CreateNote {
                value,
                owner,
                storage_slot,
                make_tx_hybrid,
                from,
            } => (
                "send",
                "call_create_note",
                format!("accounts:test{from}"),
                vec![
                    format!("{value}"),
                    format!("accounts:test{owner}"),
                    format!("{storage_slot}"),
                    format!("{make_tx_hybrid}"),
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
                from,
            } => (
                "simulate",
                "call_view_notes_many",
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{owner}"),
                    format!("{storage_slot}"),
                    format!("{active_or_nullified}"),
                ],
            ),
            GetNotesMany {
                owner,
                storage_slot,
                active_or_nullified,
                from,
            } => (
                "simulate",
                "call_get_notes_many",
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{owner}"),
                    format!("{storage_slot}"),
                    format!("{active_or_nullified}"),
                ],
            ),
            DestroyNote {
                owner,
                storage_slot,
                from,
            } => (
                "send",
                "call_destroy_note",
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{owner}"),
                    format!("{storage_slot}"),
                ],
            ),
            TestNoteInclusion {
                owner,
                storage_slot,
                from,
            } => (
                "send",
                "test_note_inclusion",
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{owner}"),
                    format!("{storage_slot}"),
                ],
            ),
            EmitNullifier { nullifier, from } => (
                "send",
                "emit_nullifier",
                format!("accounts:test{from}"),
                vec![format!("{nullifier}")],
            ),
            TestNullifierInclusion { nullifier, from } => (
                "send",
                "test_nullifier_inclusion",
                format!("accounts:test{from}"),
                vec![format!("{nullifier}")],
            ),
        };

        Ok(WalletCommand {
            verb: verb.to_string(),
            method: method.to_string(),
            contract: "contracts:test0".to_string(),
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
        let default_artifact = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/contracts/target/side_effect_contract-SideEffect.json"
        );
        let artifact =
            std::env::var("SIDE_EFFECT_ARTIFACT_PATH").unwrap_or_else(|_| default_artifact.to_string());
        wallet::deploy(
            &artifact,
            &format!("accounts:test{account}"),
            "test0",
            Some("initialize"),
            None,
        )
    }

    pub(crate) fn new() -> anyhow::Result<Self> {
        wallet::import_test_accounts()?;
        Ok(Self)
    }
}
