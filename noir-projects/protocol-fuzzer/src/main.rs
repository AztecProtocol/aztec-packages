mod machine;
pub mod smt;
mod system;

use clap::Parser;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[arg(long, default_value_t = 1)]
    min_tokens: usize,
    #[arg(long, default_value_t = 4)]
    max_tokens: usize,
    #[arg(long, default_value_t = 100000)]
    max_steps: usize,
    #[arg(long, default_value_t = 500_000_000)]
    randomness_size: u32,
}

impl From<&Args> for machine::TokenMachine {
    fn from(args: &Args) -> Self {
        let mut machine = Self::default();
        machine.min_tokens = args.min_tokens;
        machine.max_tokens = args.max_tokens;
        machine
    }
}

fn main() {
    env_logger::init();

    let args = Args::parse();

    let mut machine = machine::TokenMachine::from(&args);

    log::debug!("Starting with machine parameters: {:?}", &machine);
    smt::fixed_size_builder(args.randomness_size).run(|u| smt::run(u, &mut machine, args.max_steps))
}
