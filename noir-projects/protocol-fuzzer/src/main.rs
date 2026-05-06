mod side_effect;
pub mod smt;
mod token;
mod util;
mod wallet;

use clap::Parser;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[command(subcommand)]
    machine: MachineCommand,
}

#[derive(clap::Subcommand, Debug)]
enum MachineCommand {
    /// Fuzz the Token contract (mint/burn/transfer, public and private)
    Token(TokenArgs),
    /// Fuzz note lifecycle, nullifier emission, and cross-contract calls
    SideEffect(SideEffectArgs),
}

#[derive(clap::Args, Debug)]
struct CommonArgs {
    // TODO: The nightly sandbox's tx pool silently drops transactions after ~500
    // blocks at 5s slots, causing the fuzzer to hang. Cap at 400 until this is
    // fixed upstream.
    #[arg(long, default_value_t = 400)]
    max_steps: usize,
    #[arg(long, default_value_t = 500_000_000)]
    randomness_size: u32,
    /// Replay a specific seed (e.g. 0x5a7211231dcd6500) to reproduce a failure.
    #[arg(long, value_parser = parse_hex_u64)]
    seed: Option<u64>,
    /// Enable client-side proof generation (slower but validates proofs).
    #[arg(long, default_value_t = false)]
    prove: bool,
    /// URL of the bridge server.
    #[arg(long, default_value = "http://localhost:8089")]
    bridge_url: String,
    /// Maximum number of non-conflicting sends to batch for parallel execution.
    #[arg(long, default_value_t = 8)]
    max_batch_size: usize,
}

#[derive(clap::Args, Debug)]
struct TokenArgs {
    #[command(flatten)]
    common: CommonArgs,
    #[arg(long, default_value_t = 2)]
    min_tokens: usize,
    #[arg(long, default_value_t = 4)]
    max_tokens: usize,
}

#[derive(clap::Args, Debug)]
struct SideEffectArgs {
    #[command(flatten)]
    common: CommonArgs,
    #[arg(long, default_value_t = 5)]
    storage_slots: usize,
    /// Directory containing compiled contract artifacts.
    #[arg(long, default_value = "/tmp")]
    artifacts_dir: String,
}

fn parse_hex_u64(s: &str) -> Result<u64, String> {
    let hex = s
        .strip_prefix("0x")
        .or_else(|| s.strip_prefix("0X"))
        .ok_or_else(|| format!("seed must start with 0x: {s}"))?;
    u64::from_str_radix(hex, 16).map_err(|e| e.to_string())
}

fn make_builder(common: &CommonArgs) -> arbtest::Builder {
    match common.seed {
        Some(seed) => {
            log::info!("Replaying seed 0x{seed:016x}");
            smt::seeded_builder(seed)
        }
        None => smt::fixed_size_builder(common.randomness_size),
    }
}

fn init_logger() {
    let _ = env_logger::Builder::from_default_env()
        .filter_module("serial_test", log::LevelFilter::Off)
        .try_init();
}

fn common_args(machine: &MachineCommand) -> &CommonArgs {
    match machine {
        MachineCommand::Token(a) => &a.common,
        MachineCommand::SideEffect(a) => &a.common,
    }
}

fn main() {
    init_logger();

    let args = Args::parse();
    let common = common_args(&args.machine);

    let bridge = wallet::Bridge::new(&common.bridge_url, common.prove);
    bridge.check_connection().expect("connection check failed");

    match args.machine {
        MachineCommand::Token(ref token_args) => {
            let builder = make_builder(&token_args.common);
            let mut machine = token::TokenMachine::new(Some(&bridge));
            machine.min_tokens = token_args.min_tokens;
            machine.max_tokens = token_args.max_tokens;
            log::debug!("Starting token machine with parameters: {:?}", &machine);
            builder.run(|u| {
                smt::run_batched(
                    u,
                    &mut machine,
                    token_args.common.max_steps,
                    token_args.common.max_batch_size,
                )
            })
        }
        MachineCommand::SideEffect(ref se_args) => {
            let builder = make_builder(&se_args.common);
            let mut machine = side_effect::SideEffectMachine {
                storage_slots: se_args.storage_slots,
                bridge: Some(&bridge),
                artifacts_dir: se_args.artifacts_dir.clone(),
            };
            log::debug!(
                "Starting side-effect machine with parameters: {:?}",
                &machine
            );
            builder.run(|u| {
                smt::run_batched(
                    u,
                    &mut machine,
                    se_args.common.max_steps,
                    se_args.common.max_batch_size,
                )
            })
        }
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use serial_test::serial;
    use smt::StateMachine;
    use std::sync::LazyLock;

    // Integration tests are #[ignore] because they need a running Aztec sandbox.
    // With bridge + fast slots each tx takes ~5-13s; a full suite run is ~1-2 min.
    // Run with: cargo test -- --ignored --nocapture

    /// One-time test setup: logger + bridge connection (all tests are #[serial]).
    fn init_test_env() -> &'static wallet::Bridge {
        static BRIDGE: LazyLock<wallet::Bridge> = LazyLock::new(|| {
            init_logger();
            let url =
                std::env::var("BRIDGE_URL").unwrap_or_else(|_| "http://localhost:8089".to_string());
            let bridge = wallet::Bridge::new(&url, false);
            bridge.check_connection().expect("connection check failed");
            bridge
        });
        &BRIDGE
    }

    fn artifacts_dir() -> String {
        std::env::var("ARTIFACTS_DIR").unwrap_or_else(|_| "/tmp".to_string())
    }

    /// Verifies the sandbox is reachable and test accounts can be imported.
    /// Run this first to diagnose setup issues before running heavier tests.
    /// Prefixed with `_0` so it sorts first alphabetically (`_` < `a` in
    /// ASCII, and Rust functions are snake_case). #[serial] tests run in
    /// alphabetical order.
    #[test]
    #[ignore = "requires sandbox"]
    #[serial]
    fn _0_sandbox_smoke() {
        let bridge = init_test_env();
        bridge
            .import_test_accounts()
            .expect("import test accounts failed");
    }

    /// Deploys 1 token, runs 5 random operations. Requires a running sandbox.
    #[test]
    #[ignore = "requires sandbox"]
    #[serial]
    fn token_machine_smoke() {
        let bridge = init_test_env();
        let mut machine = token::TokenMachine::new(Some(bridge));
        machine.min_tokens = 1;
        machine.max_tokens = 1;
        machine.min_initial_public_mints = 1;
        machine.max_initial_public_mints = 2;
        machine.min_initial_private_mints = 0;
        machine.max_initial_private_mints = 1;
        // 1024 bytes of randomness is plenty for 5 steps
        smt::fixed_size_builder(1024).run(|u| smt::run(u, &mut machine, 5))
    }

    /// Deploys side-effect contract, runs 5 random operations. Requires nightly sandbox.
    #[test]
    #[ignore = "requires sandbox"]
    #[serial]
    fn side_effect_machine_smoke() {
        let bridge = init_test_env();
        let mut machine = side_effect::SideEffectMachine {
            storage_slots: 2,
            bridge: Some(bridge),
            artifacts_dir: artifacts_dir(),
        };
        smt::fixed_size_builder(1024).run(|u| smt::run(u, &mut machine, 5))
    }

    /// Private balances are only visible to the note owner. When a different account
    /// queries, the PXE returns 0 because it can't decrypt the notes.
    /// The model must account for this: check_result should expect 0 when from != address.
    #[test]
    #[ignore = "requires sandbox"]
    #[serial]
    fn token_private_balance_not_visible_to_others() {
        use std::collections::HashMap;

        let bridge = init_test_env();
        let mut machine = token::TokenMachine::new(Some(bridge));
        let state = token::machine::TokenState {
            accounts: vec![0, 1, 2],
            tokens: vec![0],
            owners: HashMap::from([(0, 0)]),
            total_supply: HashMap::from([(0, 0)]),
            ..Default::default()
        };
        let mut system = machine.new_system(&state);

        // Mint 1000 privately to test0 (from test0 = owner)
        let mint = token::machine::TokenCommand::MintPrivate {
            token: 0,
            to: 0,
            amount: 1000,
            from: 0,
        };
        let result = machine.run_command(&mut system, &mint);
        machine.check_result(&mint, &state, result);
        let state = machine.next_state(&mint, state);

        // Owner queries own balance: check_result should pass (model=1000, sandbox=1000)
        let query_self = token::machine::TokenCommand::BalanceOfPrivate {
            token: 0,
            from: 0,
            address: 0,
        };
        let result = machine.run_command(&mut system, &query_self);
        machine.check_result(&query_self, &state, result);

        // Non-owner queries: sandbox returns 0 (can't decrypt notes).
        // check_result must handle from != address correctly.
        let query_other = token::machine::TokenCommand::BalanceOfPrivate {
            token: 0,
            from: 1,
            address: 0,
        };
        let result = machine.run_command(&mut system, &query_other);
        machine.check_result(&query_other, &state, result);
    }

    /// After destroying a note, test_note_inclusion may still succeed because
    /// the PXE's get_notes(ACTIVE) can return nullified notes. The model must
    /// tolerate success on slots where notes were previously destroyed.
    #[test]
    #[ignore = "requires sandbox"]
    #[serial]
    fn side_effect_note_inclusion_after_destroy() {
        let bridge = init_test_env();
        let mut machine = side_effect::SideEffectMachine {
            storage_slots: 1,
            bridge: Some(bridge),
            artifacts_dir: artifacts_dir(),
        };
        let state = side_effect::machine::SideEffectState {
            accounts: vec![0, 1, 2],
            storage_slots: vec![1],
            ..Default::default()
        };
        let mut system = machine.new_system(&state);

        // Create a note
        let create = side_effect::machine::SideEffectCommand::CreateNote {
            value: 42,
            owner: 0,
            storage_slot: 1,
            from: 0,
            via_parent: false,
        };
        let result = machine.run_command(&mut system, &create);
        machine.check_result(&create, &state, result);
        let state = machine.next_state(&create, state);

        // Destroy the note
        let destroy = side_effect::machine::SideEffectCommand::DestroyNote {
            owner: 0,
            storage_slot: 1,
            from: 0,
            via_parent: false,
        };
        let result = machine.run_command(&mut system, &destroy);
        machine.check_result(&destroy, &state, result);
        let state = machine.next_state(&destroy, state);

        // TestNoteInclusion on now-empty slot: sandbox may succeed (PXE cache lag).
        // check_result must tolerate this instead of asserting failure.
        let inclusion = side_effect::machine::SideEffectCommand::TestNoteInclusion {
            owner: 0,
            storage_slot: 1,
            from: 0,
            via_parent: false,
        };
        let result = machine.run_command(&mut system, &inclusion);
        machine.check_result(&inclusion, &state, result);
    }

    /// Same random bytes produce the same command sequence (no system interaction).
    #[test]
    fn seeded_run_is_deterministic() {
        use arbitrary::Unstructured;

        let buf: Vec<u8> = (0u8..=255).cycle().take(4096).collect();
        let steps = 20;

        let collect_commands = |data: &[u8]| {
            let mut u = Unstructured::new(data);
            let mut machine = side_effect::SideEffectMachine {
                storage_slots: 3,
                bridge: None,
                artifacts_dir: artifacts_dir(),
            };
            let mut state = machine.gen_state(&mut u).unwrap();
            let mut commands = Vec::new();
            for _ in 0..steps {
                let cmd = machine.gen_command(&mut u, &state).unwrap();
                commands.push(format!("{:?}", cmd));
                state = machine.next_state(&cmd, state);
            }
            commands
        };

        let run1 = collect_commands(&buf);
        let run2 = collect_commands(&buf);
        assert!(!run1.is_empty(), "should generate at least one command");
        assert_eq!(
            run1, run2,
            "same input must produce identical command sequences"
        );
    }

    #[test]
    fn parse_hex_u64_lowercase() {
        assert_eq!(
            parse_hex_u64("0x5a7211231dcd6500").unwrap(),
            0x5a7211231dcd6500
        );
    }

    #[test]
    fn parse_hex_u64_uppercase_prefix() {
        assert_eq!(parse_hex_u64("0Xdeadbeef").unwrap(), 0xdeadbeef);
    }

    #[test]
    fn parse_hex_u64_no_prefix() {
        assert!(parse_hex_u64("42").is_err());
    }

    #[test]
    fn parse_hex_u64_invalid() {
        assert!(parse_hex_u64("0xZZZZ").is_err());
    }
}
