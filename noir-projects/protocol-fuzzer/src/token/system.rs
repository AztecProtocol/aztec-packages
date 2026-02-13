use super::machine::{TokenCommand, TokenId};
use crate::wallet::{self, AccountId, WalletCommand};

use anyhow::anyhow;

#[derive(Default)]
pub struct TokenSystem;

impl TryFrom<&TokenCommand> for WalletCommand {
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
            Some(&format!("accounts:test{account} token{token} TST{token} 18")),
        )
    }

    pub(crate) fn new() -> anyhow::Result<Self> {
        wallet::import_test_accounts()?;
        Ok(Self)
    }
}
