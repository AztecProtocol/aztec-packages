mod token;
pub mod smt;
mod side_effect;
mod wallet;

use clap::{Parser, ValueEnum};

#[derive(Debug, Clone, ValueEnum)]
enum MachineType {
    Token,
    SideEffect,
}

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[arg(long, default_value = "token")]
    machine: MachineType,
    #[arg(long, default_value_t = 1)]
    min_tokens: usize,
    #[arg(long, default_value_t = 4)]
    max_tokens: usize,
    #[arg(long, default_value_t = 2)]
    min_storage_slots: usize,
    #[arg(long, default_value_t = 5)]
    max_storage_slots: usize,
    #[arg(long, default_value_t = 100000)]
    max_steps: usize,
    #[arg(long, default_value_t = 500_000_000)]
    randomness_size: u32,
}

impl From<&Args> for token::TokenMachine {
    fn from(args: &Args) -> Self {
        let mut machine = Self::default();
        machine.min_tokens = args.min_tokens;
        machine.max_tokens = args.max_tokens;
        machine
    }
}

impl From<&Args> for side_effect::SideEffectMachine {
    fn from(args: &Args) -> Self {
        Self {
            min_storage_slots: args.min_storage_slots,
            max_storage_slots: args.max_storage_slots,
        }
    }
}

fn main() {
    env_logger::init();

    let args = Args::parse();

    match args.machine {
        MachineType::Token => {
            let mut machine = token::TokenMachine::from(&args);
            log::debug!("Starting token machine with parameters: {:?}", &machine);
            smt::fixed_size_builder(args.randomness_size)
                .run(|u| smt::run(u, &mut machine, args.max_steps))
        }
        MachineType::SideEffect => {
            let mut machine = side_effect::SideEffectMachine::from(&args);
            log::debug!(
                "Starting side-effect machine with parameters: {:?}",
                &machine
            );
            smt::fixed_size_builder(args.randomness_size)
                .run(|u| smt::run(u, &mut machine, args.max_steps))
        }
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;

    /// Smoke test: deploys 1 token, runs 5 random operations (mints, transfers, balance checks).
    /// Requires a running Aztec sandbox (`aztec start --sandbox`).
    /// Note: may fail on the nightly sandbox due to gas fee spikes between blocks
    /// (maxFeesPerGas estimated at simulation time becomes too low by the time the tx lands).
    #[test]
    #[ignore]
    fn token_machine_smoke() {
        env_logger::try_init().ok();
        let mut machine = token::TokenMachine::default();
        machine.min_tokens = 1;
        machine.max_tokens = 1;
        machine.min_initial_public_mints = 1;
        machine.max_initial_public_mints = 2;
        machine.min_initial_private_mints = 0;
        machine.max_initial_private_mints = 1;
        // 1024 bytes of randomness is plenty for 5 steps
        smt::fixed_size_builder(1024)
            .run(|u| smt::run(u, &mut machine, 5))
    }

    /// Smoke test: deploys side-effect contract, runs 5 random operations (create/destroy notes, nullifiers).
    /// Requires a running Aztec sandbox with the side_effect_contract artifact built (see SANDBOX_INSTRUCTIONS.md).
    /// Note: may fail on the nightly sandbox due to gas fee spikes between blocks
    /// (maxFeesPerGas estimated at simulation time becomes too low by the time the tx lands).
    #[test]
    #[ignore]
    fn side_effect_machine_smoke() {
        env_logger::try_init().ok();
        let mut machine = side_effect::SideEffectMachine {
            min_storage_slots: 2,
            max_storage_slots: 2,
        };
        smt::fixed_size_builder(1024)
            .run(|u| smt::run(u, &mut machine, 5))
    }
}
