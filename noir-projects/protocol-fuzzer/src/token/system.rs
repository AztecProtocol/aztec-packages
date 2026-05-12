use super::machine::{TokenCommand, TokenId};
use crate::wallet::{AccountId, Bridge, ExecOutput, WalletCommand};

pub struct TokenSystem<'a> {
    bridge: &'a Bridge,
}

impl From<&TokenCommand> for WalletCommand {
    fn from(cmd: &TokenCommand) -> Self {
        use TokenCommand::*;
        // authwit_nonce is always 0 because msg_sender == from in all commands.
        let args: Vec<String> = match cmd {
            MintPublic { amount, to, .. } | MintPrivate { amount, to, .. } => {
                vec![format!("accounts:test{to}"), format!("{amount}")]
            }
            BurnPublic { amount, from, .. } | BurnPrivate { amount, from, .. } => vec![
                format!("accounts:test{from}"),
                format!("{amount}"),
                "0".into(),
            ],
            TransferPublic {
                to, amount, from, ..
            }
            | TransferPrivate {
                to, amount, from, ..
            }
            | TransferPrivateToPublic {
                to, amount, from, ..
            } => vec![
                format!("accounts:test{from}"),
                format!("accounts:test{to}"),
                format!("{amount}"),
                "0".into(),
            ],
            TransferPublicToPrivate { to, amount, .. } => {
                vec![format!("accounts:test{to}"), format!("{amount}")]
            }
            BalanceOfPublic { address, .. } | BalanceOfPrivate { address, .. } => {
                vec![format!("accounts:test{address}")]
            }
            TotalSupply { .. } => vec![],
        };

        WalletCommand {
            verb: cmd.verb(),
            method: cmd.method_name().to_string(),
            contract: format!("contracts:token{}", cmd.token_id()),
            from: format!("accounts:test{}", cmd.from()),
            args,
        }
    }
}

impl<'a> TokenSystem<'a> {
    pub(crate) fn execute_command(&self, cmd: &TokenCommand) -> anyhow::Result<ExecOutput> {
        self.bridge.execute(&WalletCommand::from(cmd))
    }

    pub(crate) fn execute_command_batch(
        &self,
        cmds: &[TokenCommand],
    ) -> Vec<anyhow::Result<ExecOutput>> {
        let wallet_cmds: Vec<WalletCommand> = cmds.iter().map(WalletCommand::from).collect();
        self.bridge.execute_many(&wallet_cmds)
    }

    pub(crate) fn deploy_token(
        &self,
        account: AccountId,
        token: TokenId,
    ) -> anyhow::Result<String> {
        self.bridge.deploy(
            "TokenContractArtifact",
            &format!("accounts:test{account}"),
            &format!("token{token}"),
            None,
            Some(&format!(
                "accounts:test{account} token{token} TST{token} 18"
            )),
        )
    }

    pub(crate) fn new(bridge: &'a Bridge) -> Self {
        Self { bridge }
    }
}
