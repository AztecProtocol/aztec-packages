use std::collections::HashMap;

use anyhow::Result;
use arbitrary::{Arbitrary, Unstructured};
use log::debug;

use super::smt;
use super::system::TokenSystem;

pub(crate) type AccountId = usize;
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
    Dummy,
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
    Ok(u128::arbitrary(u)? as TokenAmount)
}

fn choose_account(u: &mut Unstructured, state: &TokenState) -> arbitrary::Result<AccountId> {
    let acc = u
        .choose(&state.accounts)
        .expect("accounts should not be empty");
    Ok(*acc)
}

fn choose_token(u: &mut Unstructured, state: &TokenState) -> arbitrary::Result<TokenId> {
    let token = u.choose(&state.tokens).expect("tokens should not be empty");
    Ok(*token)
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

        // Generate a random number of tokens
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

        for mint in &initial_mints {
            state = self.next_state(mint, state);
        }

        self.initial_mints = initial_mints;
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
            _ => TokenCommand::Dummy,
        };

        Ok(cmd)
    }

    fn new_system(&mut self, state: &Self::State) -> Self::System {
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
        let mut state = state.clone();

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
                    if let Some(supply) = supply.checked_add(*amount) {
                        state.total_supply.insert(*token, supply);
                        state
                            .balances_public
                            .entry((*token, *to))
                            .and_modify(|e| *e = e.checked_add(*amount).unwrap_or(*e))
                            .or_insert(*amount);
                    } else {
                        debug!(
                            "Overflowing total supply, public minting {amount} of {token} to {to} denied"
                        );
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
                    if let Some(supply) = supply.checked_add(*amount) {
                        state.total_supply.insert(*token, supply);
                        state
                            .balances_private
                            .entry((*token, *to))
                            .and_modify(|e| *e = e.checked_add(*amount).unwrap_or(*e))
                            .or_insert(*amount);
                    } else {
                        debug!(
                            "Overflowing total supply, private minting {amount} of {token} to {to} denied"
                        );
                    }
                }
            }
            BurnPublic {
                token,
                amount,
                from,
            } => {
                if *state.balances_public.entry((*token, *from)).or_default() >= *amount {
                    state
                        .balances_public
                        .entry((*token, *from))
                        .and_modify(|e| *e -= amount);
                    state
                        .total_supply
                        .entry(*token)
                        .and_modify(|e| *e -= amount);
                }
            }
            BurnPrivate {
                token,
                amount,
                from,
            } => {
                if *state.balances_private.entry((*token, *from)).or_default() >= *amount {
                    state
                        .balances_private
                        .entry((*token, *from))
                        .and_modify(|e| *e -= amount);
                    state
                        .total_supply
                        .entry(*token)
                        .and_modify(|e| *e -= amount);
                }
            }
            TransferPublic {
                token,
                to,
                amount,
                from,
            } => {
                if *state.balances_public.entry((*token, *from)).or_default() >= *amount {
                    state
                        .balances_public
                        .entry((*token, *from))
                        .and_modify(|e| *e -= amount);
                    state
                        .balances_public
                        .entry((*token, *to))
                        .and_modify(|e| *e += amount)
                        .or_insert(*amount);
                }
            }
            TransferPrivate {
                token,
                to,
                amount,
                from,
            } => {
                if *state.balances_private.entry((*token, *from)).or_default() >= *amount {
                    state
                        .balances_private
                        .entry((*token, *from))
                        .and_modify(|e| *e -= amount);
                    state
                        .balances_private
                        .entry((*token, *to))
                        .and_modify(|e| *e += amount)
                        .or_insert(*amount);
                }
            }
            TransferPublicToPrivate {
                token,
                to,
                amount,
                from,
            } => {
                if *state.balances_public.entry((*token, *from)).or_default() >= *amount {
                    state
                        .balances_public
                        .entry((*token, *from))
                        .and_modify(|e| *e -= amount);
                    state
                        .balances_private
                        .entry((*token, *to))
                        .and_modify(|e| *e += amount)
                        .or_insert(*amount);
                }
            }
            TransferPrivateToPublic {
                token,
                to,
                amount,
                from,
            } => {
                if *state.balances_private.entry((*token, *from)).or_default() >= *amount {
                    state
                        .balances_private
                        .entry((*token, *from))
                        .and_modify(|e| *e -= amount);
                    state
                        .balances_public
                        .entry((*token, *to))
                        .and_modify(|e| *e += amount)
                        .or_insert(*amount);
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
        // TODO: should failure states and other output aside from balance checks be also processed later?
        if let Ok(result) = result {
            if let Some(amount) = parse_token_amount(&result) {
                use TokenCommand::*;
                match cmd {
                    BalanceOfPublic { token, address, .. } => {
                        let state_balance = *pre_state
                            .balances_public
                            .get(&(*token, *address))
                            .unwrap_or(&0);
                        debug!(
                            "Checking public {} balance for {}: should be {}, is {}",
                            token, address, state_balance, amount
                        );
                        assert_eq!(amount, state_balance);
                    }
                    BalanceOfPrivate { token, address, .. } => {
                        let state_balance = *pre_state
                            .balances_private
                            .get(&(*token, *address))
                            .unwrap_or(&0);
                        debug!(
                            "Checking private {} balance for {}: should be {}, is {}",
                            token, address, state_balance, amount
                        );
                        assert_eq!(amount, state_balance);
                    }
                    TotalSupply { token, .. } => {
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

fn parse_token_amount(stdout: &str) -> Option<TokenAmount> {
    let amount_re = regex::Regex::new(r"Simulation result:\s+(\d+)n").unwrap();
    amount_re.captures(stdout).map(|caps| {
        let amount = caps.get(1).unwrap().as_str();
        TokenAmount::from_str_radix(amount, 10).unwrap_or(0)
    })
}

#[test]
fn simulation_result_parsed() {
    let stdout = "Simulation result:  208681979753062036312901159467002686397n";
    let stdout2 = "Simulation result:  208681979";
    assert_eq!(
        parse_token_balance(stdout),
        Some(208681979753062036312901159467002686397 as TokenAmount)
    );
    assert_eq!(parse_token_balance(stdout2), None);
}
