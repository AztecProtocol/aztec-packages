use super::machine::{TokenCommand, TokenId};
use crate::wallet::{self, AccountId, WalletCommand};

pub struct TokenSystem;

impl From<&TokenCommand> for WalletCommand {
    fn from(cmd: &TokenCommand) -> Self {
        use TokenCommand::*;
        // authwit_nonce is always 0 because msg_sender == from in all commands.
        let (method, contract, from, args) = match cmd {
            MintPublic {
                token,
                amount,
                from,
                to,
            } => (
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
                "balance_of_private",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![format!("accounts:test{address}")],
            ),
            TotalSupply { token, from } => (
                "total_supply",
                format!("contracts:token{token}"),
                format!("accounts:test{from}"),
                vec![],
            ),
        };

        WalletCommand {
            query: cmd.is_query(),
            method: method.to_string(),
            contract,
            from,
            args,
        }
    }
}

impl TokenSystem {
    pub(crate) fn execute_command(&self, cmd: &TokenCommand) -> anyhow::Result<String> {
        wallet::execute(&WalletCommand::from(cmd))
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

    pub(crate) fn new() -> Self {
        Self
    }
}
