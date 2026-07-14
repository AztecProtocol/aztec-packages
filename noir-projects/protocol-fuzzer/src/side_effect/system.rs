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
        let args: Vec<String> = match cmd {
            CreateNote {
                value,
                owner,
                storage_slot,
                ..
            } => vec![
                format!("{value}"),
                format!("accounts:test{owner}"),
                format!("{storage_slot}"),
            ],
            CreateAndCompletePartialNote {
                owner,
                storage_slot,
                value,
                ..
            } => vec![
                format!("accounts:test{owner}"),
                format!("{storage_slot}"),
                format!("{value}"),
            ],
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
            } => vec![
                format!("accounts:test{owner}"),
                format!("{storage_slot}"),
                format!("{active_or_nullified}"),
                format!("{offset}"),
            ],
            DestroyNote {
                owner,
                storage_slot,
                ..
            }
            | TestNoteInclusion {
                owner,
                storage_slot,
                ..
            } => vec![format!("accounts:test{owner}"), format!("{storage_slot}")],
            EmitNullifier { nullifier, .. } | TestNullifierInclusion { nullifier, .. } => {
                vec![format!("{nullifier}")]
            }
            SendL2ToL1Message {
                content, recipient, ..
            } => vec![
                format!("{content}"),
                // EthAddress is a struct { inner: Field }; the CLI's encodeArg
                // expects a 0x-prefixed 32-byte hex string for single-field structs.
                format!("0x{recipient:064x}"),
            ],
            EmitPrivateLog { tag, content, .. } => vec![format!("{tag}"), format!("{content}")],
            RequestOvskApp { from, .. } => {
                // The argument is the owner whose ovsk_app we request; passing
                // `from` exercises the success path. A mismatched owner would
                // test the failure path (kernel rejects unauthorized derivation).
                vec![format!("accounts:test{from}")]
            }
            TestSettingTeardown { .. } => vec![],
        };

        let from = format!("accounts:test{}", cmd.from());
        let method = cmd.method_name();

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
        for via_parent in [false, true] {
            for cmd in [
                SideEffectCommand::RequestOvskApp {
                    from: 0,
                    via_parent,
                },
                SideEffectCommand::TestSettingTeardown {
                    from: 0,
                    via_parent,
                },
            ] {
                self.execute_command(&cmd)
                    .map_err(|e| anyhow::anyhow!("one-shot smoke test {:?} failed: {e}", cmd))?;
            }
        }
        Ok(())
    }

    pub(crate) fn new(bridge: &'a Bridge, artifacts_dir: &str) -> Self {
        // Resolve relative paths against the current dir, but tolerate paths
        // that don't exist on the host: in Docker mode `artifacts_dir` points
        // inside the container (the bridge will read the file there).
        let path = std::path::Path::new(artifacts_dir);
        let dir = if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir().expect("cwd unavailable").join(path)
        };
        let dir = dir.display();
        Self {
            side_effect_artifact: format!("{dir}/side_effect_contract-SideEffect.json"),
            parent_artifact: format!("{dir}/parent_contract-Parent.json"),
            bridge,
        }
    }
}
