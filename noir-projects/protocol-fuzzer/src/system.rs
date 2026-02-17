use super::machine::{AccountId, TokenCommand, TokenId};

use anyhow::anyhow;
use log::debug;
use rsbash::{rash, rashf};

#[derive(Default)]
pub struct TokenSystem {
    pub ready: bool,
}

pub struct SystemCommand {
    pub verb: String,
    pub method: String,
    pub contract: String,
    pub from: String,
    pub args: Vec<String>,
}

impl TryFrom<&TokenCommand> for SystemCommand {
    type Error = anyhow::Error;

    fn try_from(cmd: &TokenCommand) -> anyhow::Result<Self> {
        use TokenCommand::*;
        let (verb, method, contract, from, args) = match cmd {
            MintPublic {
                token,
                amount,
                from,
                to,
            } => Some((
                "send",
                "mint_to_public",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{to}"), format!("{amount}")],
            )),
            MintPrivate {
                token,
                amount,
                from,
                to,
            } => Some((
                "send",
                "mint_to_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{to}"), format!("{amount}")],
            )),
            BurnPublic {
                token,
                amount,
                from,
            } => Some((
                "send",
                "burn_public",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                // authwit_nonce is 0 as msg_sender == from
                vec![
                    format!("accounts:test{from}"),
                    format!("{amount}"),
                    "0".into(),
                ],
            )),
            BurnPrivate {
                token,
                amount,
                from,
            } => Some((
                "send",
                "burn_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                // authwit_nonce is 0 as msg_sender == from
                vec![
                    format!("accounts:test{from}"),
                    format!("{amount}"),
                    "0".into(),
                ],
            )),
            TransferPublic {
                token,
                to,
                amount,
                from,
            } => Some((
                "send",
                "transfer_in_public",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                // authwit_nonce is 0 as msg_sender == from
                vec![
                    format!("accounts:test{from}"),
                    format!("accounts:test{to}"),
                    format!("{amount}"),
                    "0".into(),
                ],
            )),
            TransferPrivate {
                token,
                to,
                amount,
                from,
            } => Some((
                "send",
                "transfer_in_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                // authwit_nonce is 0 as msg_sender == from
                vec![
                    format!("accounts:test{from}"),
                    format!("accounts:test{to}"),
                    format!("{amount}"),
                    "0".into(),
                ],
            )),
            TransferPublicToPrivate {
                token,
                to,
                amount,
                from,
            } => Some((
                "send",
                "transfer_to_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{to}"), format!("{amount}")],
            )),
            TransferPrivateToPublic {
                token,
                to,
                amount,
                from,
            } => Some((
                "send",
                "transfer_to_public",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                // authwit_nonce is 0 as msg_sender == from
                vec![
                    format!("accounts:test{from}"),
                    format!("accounts:test{to}"),
                    format!("{amount}"),
                    "0".into(),
                ],
            )),
            BalanceOfPublic {
                token,
                from,
                address,
            } => Some((
                "simulate",
                "balance_of_public",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{address}")],
            )),
            BalanceOfPrivate {
                token,
                from,
                address,
            } => Some((
                "simulate",
                "balance_of_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{address}")],
            )),
            TotalSupply { token, from } => Some((
                "simulate",
                "total_supply",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![],
            )),
            _ => None,
        }
        .ok_or_else(|| anyhow!("unimplemented system command for token: {:?}", cmd))?;

        Ok(SystemCommand {
            verb: verb.to_string(),
            method: method.to_string(),
            contract,
            from,
            args,
        })
    }
}

impl TokenSystem {
    pub(crate) fn execute_command(&self, cmd: &TokenCommand) -> anyhow::Result<String> {
        let cmd = SystemCommand::try_from(cmd)?;
        let (verb, method, from, contract, args) = (
            cmd.verb,
            cmd.method,
            cmd.from,
            cmd.contract,
            cmd.args.join(" "),
        );
        let mut syscmd = format!(
            "aztec-wallet {verb} {method} --from {from} \
            --contract-address {contract}"
        );
        if !cmd.args.is_empty() {
            syscmd.push_str(&format!(" --args {args}"));
        }
        let (_, stdout, _) = rash!(&syscmd)?;
        debug!("{syscmd}");
        Ok(stdout)
    }

    pub(crate) fn deploy_token(
        &self,
        account: AccountId,
        token: TokenId,
    ) -> anyhow::Result<String> {
        let (_, stdout, _) = rashf!(
            "aztec-wallet deploy TokenContractArtifact --from accounts:test{account} \
            --args accounts:test{account} token{token} TST{token} 18 \
            --alias token{token}"
        )?;
        Ok(stdout)
    }

    pub(crate) fn new() -> anyhow::Result<Self> {
        let mut system = Self::default();

        debug!("Running import-test-accounts");
        rash!("aztec-wallet import-test-accounts")?;
        system.ready = true;

        Ok(system)
    }
}
