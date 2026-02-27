use super::machine::{TokenCommand, TokenId};
use crate::wallet::{self, AccountId, WalletCommand};

#[derive(Default)]
pub struct TokenSystem;

impl TryFrom<&TokenCommand> for WalletCommand {
    type Error = anyhow::Error;

    fn try_from(cmd: &TokenCommand) -> anyhow::Result<Self> {
        use TokenCommand::*;
        // authwit_nonce is always 0 because msg_sender == from in all commands.
        let (verb, method, contract, from, args) = match cmd {
            MintPublic {
                token,
                amount,
                from,
                to,
            } => (
                "send",
                "mint_to_public",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{to}"), format!("{amount}")],
            ),
            MintPrivate {
                token,
                amount,
                from,
                to,
            } => (
                "send",
                "mint_to_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{to}"), format!("{amount}")],
            ),
            BurnPublic {
                token,
                amount,
                from,
            } => (
                "send",
                "burn_public",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{from}"),
                    format!("{amount}"),
                    "0".into(),
                ],
            ),
            BurnPrivate {
                token,
                amount,
                from,
            } => (
                "send",
                "burn_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{from}"),
                    format!("{amount}"),
                    "0".into(),
                ],
            ),
            TransferPublic {
                token,
                to,
                amount,
                from,
            } => (
                "send",
                "transfer_in_public",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{from}"),
                    format!("accounts:test{to}"),
                    format!("{amount}"),
                    "0".into(),
                ],
            ),
            TransferPrivate {
                token,
                to,
                amount,
                from,
            } => (
                "send",
                "transfer_in_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{from}"),
                    format!("accounts:test{to}"),
                    format!("{amount}"),
                    "0".into(),
                ],
            ),
            TransferPublicToPrivate {
                token,
                to,
                amount,
                from,
            } => (
                "send",
                "transfer_to_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{to}"), format!("{amount}")],
            ),
            TransferPrivateToPublic {
                token,
                to,
                amount,
                from,
            } => (
                "send",
                "transfer_to_public",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![
                    format!("accounts:test{from}"),
                    format!("accounts:test{to}"),
                    format!("{amount}"),
                    "0".into(),
                ],
            ),
            BalanceOfPublic {
                token,
                from,
                address,
            } => (
                "simulate",
                "balance_of_public",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{address}")],
            ),
            BalanceOfPrivate {
                token,
                from,
                address,
            } => (
                "simulate",
                "balance_of_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{address}")],
            ),
            TotalSupply { token, from } => (
                "simulate",
                "total_supply",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![],
            ),
        };

        Ok(WalletCommand {
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
        let wallet_cmd = WalletCommand::try_from(cmd)?;
        wallet::execute(&wallet_cmd)
    }

    pub(crate) fn deploy_token(
        &self,
        account: AccountId,
        token: TokenId,
    ) -> anyhow::Result<String> {
        wallet::deploy(
            "TokenContractArtifact",
            &format!("accounts:test{account}"),
            &format!("token{token}"),
            None,
            Some(&format!(
                "accounts:test{account} token{token} TST{token} 18"
            )),
        )
    }

    pub(crate) fn new() -> anyhow::Result<Self> {
        Ok(Self)
    }
}
