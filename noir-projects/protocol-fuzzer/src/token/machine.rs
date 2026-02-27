use std::collections::HashMap;

use anyhow::Result;
use arbitrary::{Arbitrary, Unstructured};
use log::debug;

use super::system::TokenSystem;
use crate::smt;
use crate::wallet::{self, AccountId};

pub(crate) type TokenId = usize;

#[derive(Debug)]
pub struct TokenMachine {
    pub min_tokens: usize,
    pub max_tokens: usize,
    pub min_initial_public_mints: usize,
    pub max_initial_public_mints: usize,
    pub min_initial_private_mints: usize,
    pub max_initial_private_mints: usize,
    initial_mints: Vec<TokenCommand>,
}

impl Default for TokenMachine {
    fn default() -> Self {
        Self {
            min_tokens: 1,
            max_tokens: 4,
            min_initial_public_mints: 0,
            max_initial_public_mints: 10,
            min_initial_private_mints: 0,
            max_initial_private_mints: 10,
            initial_mints: vec![],
        }
    }
}

#[derive(Debug, Clone)]
pub enum TokenCommand {
    BalanceOfPublic {
        token: TokenId,
        from: AccountId,
        address: AccountId,
    },
    BalanceOfPrivate {
        token: TokenId,
        from: AccountId,
        address: AccountId,
    },
    TotalSupply {
        token: TokenId,
        from: AccountId,
    },
    MintPublic {
        token: TokenId,
        to: AccountId,
        amount: TokenAmount,
        from: AccountId,
    },
    MintPrivate {
        token: TokenId,
        to: AccountId,
        amount: TokenAmount,
        from: AccountId,
    },
    TransferPublic {
        token: TokenId,
        to: AccountId,
        amount: TokenAmount,
        from: AccountId,
    },
    TransferPrivate {
        token: TokenId,
        to: AccountId,
        amount: TokenAmount,
        from: AccountId,
    },
    TransferPublicToPrivate {
        token: TokenId,
        to: AccountId,
        amount: TokenAmount,
        from: AccountId,
    },
    TransferPrivateToPublic {
        token: TokenId,
        to: AccountId,
        amount: TokenAmount,
        from: AccountId,
    },
    BurnPublic {
        token: TokenId,
        amount: TokenAmount,
        from: AccountId,
    },
    BurnPrivate {
        token: TokenId,
        amount: TokenAmount,
        from: AccountId,
    },
}

type TokenAmount = u128;

#[derive(Debug, Clone, Default)]
pub struct TokenState {
    pub accounts: Vec<AccountId>,
    pub tokens: Vec<TokenId>,
    pub owners: HashMap<TokenId, AccountId>,
    pub balances_public: HashMap<(TokenId, AccountId), TokenAmount>,
    pub balances_private: HashMap<(TokenId, AccountId), TokenAmount>,
    pub total_supply: HashMap<TokenId, TokenAmount>,
}

fn gen_token_amount(u: &mut Unstructured) -> arbitrary::Result<TokenAmount> {
    u128::arbitrary(u)
}

fn choose_account(u: &mut Unstructured, state: &TokenState) -> arbitrary::Result<AccountId> {
    u.choose(&state.accounts).copied()
}

fn choose_token(u: &mut Unstructured, state: &TokenState) -> arbitrary::Result<TokenId> {
    u.choose(&state.tokens).copied()
}

type BalanceMap = HashMap<(TokenId, AccountId), TokenAmount>;

/// Subtract `amount` from the balance at `key`, returning `true` if sufficient funds existed.
/// Inserts a zero entry if the key is absent (matching the existing behavior).
fn try_debit(balances: &mut BalanceMap, key: (TokenId, AccountId), amount: TokenAmount) -> bool {
    let balance = balances.entry(key).or_default();
    if *balance >= amount {
        *balance -= amount;
        true
    } else {
        false
    }
}

/// Add `amount` to the balance at `key`.
fn credit(balances: &mut BalanceMap, key: (TokenId, AccountId), amount: TokenAmount) {
    *balances.entry(key).or_default() += amount;
}

impl TokenMachine {
    fn gen_valid_mint(
        &self,
        u: &mut Unstructured,
        state: &TokenState,
        public: bool,
    ) -> arbitrary::Result<TokenCommand> {
        let token = choose_token(u, state)?;
        let amount = gen_token_amount(u)?;
        let from = *state
            .owners
            .get(&token)
            .expect("token should have a valid minter owner");
        let to = choose_account(u, state)?;

        if public {
            Ok(TokenCommand::MintPublic {
                token,
                amount,
                from,
                to,
            })
        } else {
            Ok(TokenCommand::MintPrivate {
                token,
                amount,
                from,
                to,
            })
        }
    }
}

impl smt::StateMachine for TokenMachine {
    type System = TokenSystem;
    type State = TokenState;
    type Command = TokenCommand;
    type Result = Result<String>;

    fn gen_state(&mut self, u: &mut Unstructured) -> arbitrary::Result<Self::State> {
        let mut state = Self::State {
            accounts: vec![0, 1, 2],
            ..Default::default()
        };

        let num_tokens = u.int_in_range(self.min_tokens..=self.max_tokens)?;
        state.tokens = (0..num_tokens).collect();

        for token_no in 0..num_tokens {
            // Assign random account owners to tokens
            state
                .owners
                .insert(token_no, *u.choose_iter(&state.accounts)?);

            // Set initial total supply to 0
            state.total_supply.insert(token_no, 0);
        }

        let mut initial_mints = vec![];

        // Mint some tokens for public and private balances
        let num_initial_public_mints =
            u.int_in_range(self.min_initial_public_mints..=self.max_initial_public_mints)?;
        for _ in 0..num_initial_public_mints {
            initial_mints.push(self.gen_valid_mint(u, &state, true)?);
        }

        let num_initial_private_mints =
            u.int_in_range(self.min_initial_private_mints..=self.max_initial_private_mints)?;
        for _ in 0..num_initial_private_mints {
            initial_mints.push(self.gen_valid_mint(u, &state, false)?);
        }

        // Only keep mints that next_state actually applies (rejects overflows silently).
        let mut successful_mints = vec![];
        for mint in initial_mints {
            let token_id = match &mint {
                TokenCommand::MintPublic { token, .. }
                | TokenCommand::MintPrivate { token, .. } => *token,
                _ => unreachable!(),
            };
            let supply_before = *state.total_supply.get(&token_id).unwrap_or(&0);
            state = self.next_state(&mint, state);
            if *state.total_supply.get(&token_id).unwrap_or(&0) != supply_before {
                successful_mints.push(mint);
            }
        }

        self.initial_mints = successful_mints;
        Ok(state)
    }

    fn gen_command(
        &self,
        u: &mut Unstructured,
        state: &Self::State,
    ) -> arbitrary::Result<Self::Command> {
        let cmd = u.choose(&[
            "mint_public",
            "mint_private",
            "burn_public",
            "burn_private",
            "transfer_public",
            "transfer_private",
            "transfer_public_to_private",
            "transfer_private_to_public",
            "balance_of_public",
            "balance_of_private",
            "total_supply",
        ])?;

        let cmd = match *cmd {
            "mint_public" => TokenCommand::MintPublic {
                token: choose_token(u, state)?,
                amount: gen_token_amount(u)?,
                from: choose_account(u, state)?,
                to: choose_account(u, state)?,
            },
            "mint_private" => TokenCommand::MintPrivate {
                token: choose_token(u, state)?,
                amount: gen_token_amount(u)?,
                from: choose_account(u, state)?,
                to: choose_account(u, state)?,
            },
            "burn_public" => TokenCommand::BurnPublic {
                token: choose_token(u, state)?,
                amount: gen_token_amount(u)?,
                from: choose_account(u, state)?,
            },
            "burn_private" => TokenCommand::BurnPrivate {
                token: choose_token(u, state)?,
                amount: gen_token_amount(u)?,
                from: choose_account(u, state)?,
            },
            "transfer_public" => TokenCommand::TransferPublic {
                token: choose_token(u, state)?,
                amount: gen_token_amount(u)?,
                from: choose_account(u, state)?,
                to: choose_account(u, state)?,
            },
            "transfer_private" => TokenCommand::TransferPrivate {
                token: choose_token(u, state)?,
                amount: gen_token_amount(u)?,
                from: choose_account(u, state)?,
                to: choose_account(u, state)?,
            },
            "transfer_public_to_private" => TokenCommand::TransferPublicToPrivate {
                token: choose_token(u, state)?,
                amount: gen_token_amount(u)?,
                from: choose_account(u, state)?,
                to: choose_account(u, state)?,
            },
            "transfer_private_to_public" => TokenCommand::TransferPrivateToPublic {
                token: choose_token(u, state)?,
                amount: gen_token_amount(u)?,
                from: choose_account(u, state)?,
                to: choose_account(u, state)?,
            },
            "balance_of_public" => TokenCommand::BalanceOfPublic {
                token: choose_token(u, state)?,
                from: choose_account(u, state)?,
                address: choose_account(u, state)?,
            },
            "balance_of_private" => TokenCommand::BalanceOfPrivate {
                token: choose_token(u, state)?,
                from: choose_account(u, state)?,
                address: choose_account(u, state)?,
            },
            "total_supply" => TokenCommand::TotalSupply {
                token: choose_token(u, state)?,
                from: choose_account(u, state)?,
            },
            _ => unreachable!(),
        };

        Ok(cmd)
    }

    fn new_system(&mut self, state: &Self::State) -> Self::System {
        wallet::import_test_accounts().expect("could not import test accounts");
        let system = TokenSystem::new().expect("test system couldn't be prepared correctly");
        for token_no in &state.tokens {
            let acc_no = state
                .owners
                .get(token_no)
                .expect("token should have a correct owner assigned");

            system
                .deploy_token(*acc_no, *token_no)
                .expect("token could not be deployed");
        }

        for mint in &self.initial_mints {
            system
                .execute_command(mint)
                .expect("initial mints should work");
        }

        system
    }

    fn next_state(&self, cmd: &Self::Command, state: Self::State) -> Self::State {
        use TokenCommand::*;
        let mut state = state;

        match cmd {
            MintPublic {
                token,
                amount,
                from,
                to,
            } => {
                if state.owners[token] == *from {
                    let supply = state
                        .total_supply
                        .get(token)
                        .expect("total supply should be initialized");
                    let balance = *state.balances_public.get(&(*token, *to)).unwrap_or(&0);
                    if let (Some(new_supply), Some(new_balance)) =
                        (supply.checked_add(*amount), balance.checked_add(*amount))
                    {
                        state.total_supply.insert(*token, new_supply);
                        state.balances_public.insert((*token, *to), new_balance);
                    } else {
                        debug!("Overflow minting {amount} of {token} to {to} (public), denied");
                    }
                }
            }
            MintPrivate {
                token,
                amount,
                from,
                to,
            } => {
                if state.owners[token] == *from {
                    let supply = state
                        .total_supply
                        .get(token)
                        .expect("total supply should be initialized");
                    let balance = *state.balances_private.get(&(*token, *to)).unwrap_or(&0);
                    if let (Some(new_supply), Some(new_balance)) =
                        (supply.checked_add(*amount), balance.checked_add(*amount))
                    {
                        state.total_supply.insert(*token, new_supply);
                        state.balances_private.insert((*token, *to), new_balance);
                    } else {
                        debug!("Overflow minting {amount} of {token} to {to} (private), denied");
                    }
                }
            }
            BurnPublic {
                token,
                amount,
                from,
            } => {
                if try_debit(&mut state.balances_public, (*token, *from), *amount) {
                    *state.total_supply.get_mut(token).unwrap() -= amount;
                }
            }
            BurnPrivate {
                token,
                amount,
                from,
            } => {
                if try_debit(&mut state.balances_private, (*token, *from), *amount) {
                    *state.total_supply.get_mut(token).unwrap() -= amount;
                }
            }
            TransferPublic {
                token,
                to,
                amount,
                from,
            } => {
                if try_debit(&mut state.balances_public, (*token, *from), *amount) {
                    credit(&mut state.balances_public, (*token, *to), *amount);
                }
            }
            TransferPrivate {
                token,
                to,
                amount,
                from,
            } => {
                if try_debit(&mut state.balances_private, (*token, *from), *amount) {
                    credit(&mut state.balances_private, (*token, *to), *amount);
                }
            }
            TransferPublicToPrivate {
                token,
                to,
                amount,
                from,
            } => {
                if try_debit(&mut state.balances_public, (*token, *from), *amount) {
                    credit(&mut state.balances_private, (*token, *to), *amount);
                }
            }
            TransferPrivateToPublic {
                token,
                to,
                amount,
                from,
            } => {
                if try_debit(&mut state.balances_private, (*token, *from), *amount) {
                    credit(&mut state.balances_public, (*token, *to), *amount);
                }
            }
            _ => (),
        };

        state
    }

    fn run_command(&self, system: &mut Self::System, cmd: &Self::Command) -> Self::Result {
        system.execute_command(cmd)
    }

    fn check_result(&self, cmd: &Self::Command, pre_state: &Self::State, result: Self::Result) {
        use TokenCommand::*;
        match cmd {
            BalanceOfPublic { token, address, .. } => {
                let output = result.expect("BalanceOfPublic should succeed");
                let amount = wallet::parse_simulation_result(&output)
                    .expect("failed to parse BalanceOfPublic simulation result");
                let state_balance =
                    *pre_state.balances_public.get(&(*token, *address)).unwrap_or(&0);
                debug!(
                    "Checking public {} balance for {}: should be {}, is {}",
                    token, address, state_balance, amount
                );
                assert_eq!(amount, state_balance);
            }
            BalanceOfPrivate {
                token,
                from,
                address,
            } => {
                let output = result.expect("BalanceOfPrivate should succeed");
                let amount = wallet::parse_simulation_result(&output)
                    .expect("failed to parse BalanceOfPrivate simulation result");
                // Private notes are encrypted — only the owner's PXE can decrypt them.
                // When from != address, the PXE returns 0.
                let expected = if from == address {
                    *pre_state
                        .balances_private
                        .get(&(*token, *address))
                        .unwrap_or(&0)
                } else {
                    0
                };
                debug!(
                    "Checking private {} balance for {} (from {}): should be {}, is {}",
                    token, address, from, expected, amount
                );
                assert_eq!(amount, expected);
            }
            TotalSupply { token, .. } => {
                let output = result.expect("TotalSupply should succeed");
                let amount = wallet::parse_simulation_result(&output)
                    .expect("failed to parse TotalSupply simulation result");
                let state_supply = *pre_state.total_supply.get(token).unwrap_or(&0);
                debug!(
                    "Checking {} total supply: should be {}, is {}",
                    token, state_supply, amount
                );
                assert_eq!(amount, state_supply);
            }
            _ => {}
        }
    }

    fn check_system(
        &self,
        _cmd: &Self::Command,
        _post_state: &Self::State,
        _post_system: &Self::System,
    ) -> bool {
        true
    }
}
