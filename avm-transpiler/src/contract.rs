use log::info;
use regex::Regex;
use serde::{Deserialize, Serialize};

use acvm::acir::circuit::Circuit;
use noirc_driver::ContractFunctionType;

use crate::transpile::brillig_to_avm;
use crate::utils::acir_to_brillig;

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)] // omit Acir/Avm tag for these objects in json
pub enum AvmOrAcirContractFunction {
    Acir(AcirContractFunction),
    Avm(AvmContractFunction),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranspiledContract {
    pub transpiled: bool,
    pub noir_version: String,
    pub name: String,
    pub functions: Vec<AvmOrAcirContractFunction>,
    pub events: serde_json::Value,
    pub file_map: serde_json::Value,
    //pub warnings: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompiledAcirContract {
    pub noir_version: String,
    pub name: String,
    pub functions: Vec<AcirContractFunction>,
    pub events: serde_json::Value,
    pub file_map: serde_json::Value,
    //pub warnings: serde_json::Value,
}

impl From<CompiledAcirContract> for TranspiledContract {
    fn from(contract: CompiledAcirContract) -> Self {
        let mut functions = Vec::new();
        for function in contract.functions {
            // TODO(4269): once functions are tagged for transpilation to AVM, check tag
            let re = Regex::new(r"avm_.*$").unwrap();
            if function.function_type == ContractFunctionType::Unconstrained
                && re.is_match(function.name.as_str())
            {
                info!(
                    "Transpiling AVM function {} on contract {}",
                    function.name, contract.name
                );
                // Extract Brillig Opcodes from acir
                let acir_circuit = function.bytecode.clone();
                let brillig = acir_to_brillig(&acir_circuit.opcodes);

                // Transpile to AVM
                let avm_bytecode = brillig_to_avm(&brillig);

                // Push modified function entry to ABI
                functions.push(AvmOrAcirContractFunction::Avm(AvmContractFunction {
                    name: function.name,
                    function_type: function.function_type,
                    is_internal: function.is_internal,
                    abi: function.abi,
                    bytecode: base64::encode(avm_bytecode),
                    debug_symbols: function.debug_symbols,
                }));
            } else {
                // Not an AVM function, push original ABI entry
                functions.push(AvmOrAcirContractFunction::Acir(function));
            }
        }
        TranspiledContract {
            transpiled: true,
            noir_version: contract.noir_version,
            name: contract.name,
            functions,
            events: contract.events,
            file_map: contract.file_map,
            //warnings: contract.warnings,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AcirContractFunction {
    pub name: String,
    pub function_type: ContractFunctionType,
    pub is_internal: bool,
    pub abi: serde_json::Value,
    #[serde(
        serialize_with = "Circuit::serialize_circuit_base64",
        deserialize_with = "Circuit::deserialize_circuit_base64"
    )]
    pub bytecode: Circuit,
    pub debug_symbols: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AvmContractFunction {
    pub name: String,
    pub function_type: ContractFunctionType,
    pub is_internal: bool,
    pub abi: serde_json::Value,
    pub bytecode: String, // base64
    pub debug_symbols: serde_json::Value,
}
