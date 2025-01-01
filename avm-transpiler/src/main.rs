#![warn(clippy::semicolon_if_nothing_returned)]
#![cfg_attr(not(test), warn(unused_crate_dependencies, unused_extern_crates))]

use log::{error, warn};
use std::env;
use std::fs;
use std::path::Path;
use std::process;

mod bit_traits;
mod instructions;
mod opcodes;
mod transpile;
mod transpile_contract;
mod utils;

use transpile_contract::{CompiledAcirContractArtifact, TranspiledContractArtifact};

#[derive(Debug)]
struct Config {
    input_path: String,
    output_path: String,
}

impl Config {
    fn new(args: &[String]) -> Result<Config, &'static str> {
        if args.len() < 3 {
            return Err("Not enough arguments. Usage: program <input_path> <output_path>");
        }

        let input_path = args[1].clone();
        let output_path = args[2].clone();

        Ok(Config {
            input_path,
            output_path,
        })
    }
}

fn run(config: Config) -> Result<(), Box<dyn std::error::Error>> {
    let json_parse_error = format!(
        "Unable to parse json for: {}
    This is probably a stale json file with a different wire format.
    You might need to recompile the contract or delete the json file",
        config.input_path
    );

    // Parse original (pre-transpile) contract.
    let contract_json = fs::read_to_string(Path::new(&config.input_path))
        .map_err(|_| format!("Unable to read file: {}", config.input_path))?;

    let raw_json_obj: serde_json::Value = serde_json::from_str(&contract_json)
        .map_err(|_| json_parse_error.clone())?;

    // Skip if contract has "transpiled: true" flag!
    if let Some(serde_json::Value::Bool(true)) = raw_json_obj.get("transpiled") {
        warn!("Contract already transpiled. Skipping.");
        return Ok(());
    }

    // Backup the output file if it already exists.
    if Path::new(&config.output_path).exists() {
        fs::copy(
            Path::new(&config.output_path),
            Path::new(&(config.output_path.clone() + ".bak")),
        )
        .map_err(|_| format!("Unable to backup file: {}", config.output_path))?;
    }

    // Parse json into contract object
    let contract: CompiledAcirContractArtifact = serde_json::from_str(&contract_json)
        .map_err(|_| json_parse_error)?;

    // Transpile contract to AVM bytecode
    let transpiled_contract = TranspiledContractArtifact::from(contract);
    let transpiled_json = serde_json::to_string(&transpiled_contract)
        .map_err(|_| "Unable to serialize json")?;

    fs::write(&config.output_path, transpiled_json)
        .map_err(|_| format!("Unable to write file: {}", config.output_path))?;

    Ok(())
}

fn main() {
    env_logger::init();

    let args: Vec<String> = env::args().collect();
    let config = Config::new(&args).unwrap_or_else(|err| {
        error!("Problem parsing arguments: {err}");
        process::exit(1);
    });

    if let Err(e) = run(config) {
        error!("Application error: {e}");
        process::exit(1);
    }
}
