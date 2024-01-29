use std::env;
use std::fs;
use std::path::Path;

mod acir_brillig_utils;
mod contract;
mod opcodes;
mod transpile;

use contract::{CompiledAcirContract, TranspiledContract};

fn main() {
    let args: Vec<String> = env::args().collect();
    let in_contract_artifact_path = &args[1];
    let out_transpiled_artifact_path = &args[2];

    // Parse original (pre-transpile) contract
    let contract_json =
        fs::read_to_string(Path::new(in_contract_artifact_path)).expect("Unable to read file");
    let raw_json_obj: serde_json::Value =
        serde_json::from_str(&contract_json).expect("Unable to parse json");

    // Skip if contract has "transpiled: true" flag!
    if let Some(transpiled) = raw_json_obj.get("transpiled") {
        match transpiled {
            serde_json::Value::Bool(true) => {
                println!("Contract already transpiled. Skipping.");
                return; // nothing to transpile
            }
            _ => (),
        }
    }
    // Parse json into contract object
    let contract: CompiledAcirContract =
        serde_json::from_str(&contract_json).expect("Unable to parse json");

    // Transpile entire contract (all functions that should become AVM bytecode)
    let transpiled_contract = TranspiledContract::from(contract);
    let transpiled_json =
        serde_json::to_string(&transpiled_contract).expect("Unable to serialize json");
    fs::write(out_transpiled_artifact_path, transpiled_json).expect("Unable to write file");
}
