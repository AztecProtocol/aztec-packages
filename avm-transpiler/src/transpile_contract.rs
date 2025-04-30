use std::collections::BTreeMap;

use acvm::FieldElement;
use base64::Engine;
use log::info;
use serde::{Deserialize, Serialize};

use acvm::acir::circuit::Program;
use noirc_abi::{Abi, AbiErrorType, AbiParameter, AbiType};
use noirc_errors::debug_info::{DebugInfo, ProgramDebugInfo};
use noirc_evaluator::ErrorType;

use crate::instructions::{AvmInstruction, AvmOperand, AvmTypeTag};
use crate::opcodes::AvmOpcode;
use crate::transpile::{brillig_to_avm, patch_debug_info_pcs};
use crate::utils::extract_brillig_from_acir_program;

/// Representation of a contract with some transpiled functions
#[derive(Debug, Serialize, Deserialize)]
pub struct TranspiledContractArtifact {
    pub transpiled: bool,
    pub noir_version: String,
    pub name: String,
    // Functions can be ACIR or AVM
    pub functions: Vec<AvmOrAcirContractFunctionArtifact>,
    pub outputs: serde_json::Value,
    pub file_map: serde_json::Value,
}

/// A regular contract with ACIR+Brillig functions
/// but with fields irrelevant to transpilation
/// represented as catch-all serde Values
#[derive(Debug, Serialize, Deserialize)]
pub struct CompiledAcirContractArtifact {
    pub noir_version: String,
    pub name: String,
    pub functions: Vec<AcirContractFunctionArtifact>,
    pub outputs: serde_json::Value,
    pub file_map: serde_json::Value,
}

/// Representation of a contract function
/// with AVM bytecode as a base64 string
#[derive(Debug, Serialize, Deserialize)]
pub struct AvmContractFunctionArtifact {
    pub name: String,
    pub is_unconstrained: bool,
    pub custom_attributes: Vec<String>,
    pub abi: Abi,
    pub bytecode: String, // base64
    #[serde(
        serialize_with = "ProgramDebugInfo::serialize_compressed_base64_json",
        deserialize_with = "ProgramDebugInfo::deserialize_compressed_base64_json"
    )]
    pub debug_symbols: ProgramDebugInfo,
    pub brillig_names: Vec<String>,
}

/// Representation of an ACIR contract function but with
/// catch-all serde Values for fields irrelevant to transpilation
#[derive(Debug, Serialize, Deserialize)]
pub struct AcirContractFunctionArtifact {
    pub name: String,
    pub is_unconstrained: bool,
    pub custom_attributes: Vec<String>,
    pub abi: Abi,
    #[serde(
        serialize_with = "Program::serialize_program_base64",
        deserialize_with = "Program::deserialize_program_base64"
    )]
    pub bytecode: Program<FieldElement>,
    #[serde(
        serialize_with = "ProgramDebugInfo::serialize_compressed_base64_json",
        deserialize_with = "ProgramDebugInfo::deserialize_compressed_base64_json"
    )]
    pub debug_symbols: ProgramDebugInfo,
    pub brillig_names: Vec<String>,
}

/// An enum that allows the TranspiledContract struct to contain
/// functions with either ACIR or AVM bytecode
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)] // omit Acir/Avm tag for these objects in json
pub enum AvmOrAcirContractFunctionArtifact {
    Acir(AcirContractFunctionArtifact),
    Avm(AvmContractFunctionArtifact),
}

/// Transpilation is performed when a TranspiledContract
/// is constructed from a CompiledAcirContract
impl From<CompiledAcirContractArtifact> for TranspiledContractArtifact {
    fn from(contract: CompiledAcirContractArtifact) -> Self {
        let mut functions: Vec<AvmOrAcirContractFunctionArtifact> = Vec::new();
        let mut has_public_dispatch = false;

        for function in contract.functions {
            if function.custom_attributes.contains(&"public".to_string()) {
                if function.name == "public_dispatch" {
                    has_public_dispatch = true;
                }
                info!("Transpiling AVM function {} on contract {}", function.name, contract.name);
                // Extract Brillig Opcodes from acir
                let acir_program = function.bytecode;
                let brillig_bytecode = extract_brillig_from_acir_program(&acir_program);
                info!("Extracted Brillig program has {} instructions", brillig_bytecode.len());

                // Transpile to AVM
                let (avm_bytecode, brillig_pcs_to_avm_pcs) = brillig_to_avm(brillig_bytecode);

                log::info!(
                    "{}::{}: bytecode is {} bytes",
                    contract.name,
                    function.name,
                    avm_bytecode.len(),
                );

                // Patch the debug infos with updated PCs
                let debug_infos = patch_debug_info_pcs(
                    function.debug_symbols.debug_infos,
                    &brillig_pcs_to_avm_pcs,
                );

                // Push modified function entry to ABI
                functions.push(AvmOrAcirContractFunctionArtifact::Avm(
                    AvmContractFunctionArtifact {
                        name: function.name,
                        is_unconstrained: function.is_unconstrained,
                        custom_attributes: function.custom_attributes,
                        abi: function.abi,
                        bytecode: base64::prelude::BASE64_STANDARD.encode(avm_bytecode),
                        debug_symbols: ProgramDebugInfo { debug_infos },
                        brillig_names: function.brillig_names,
                    },
                ));
            } else {
                // This function is not flagged for transpilation. Push original entry.
                functions.push(AvmOrAcirContractFunctionArtifact::Acir(function));
            }
        }

        // The AVM currently does not allow executing empty bytecode. In order to avoid this,
        // we have disabled registering classes with empty bytecode. This makes it so private only
        // contracts need to have public bytecode to be registrable. We inject revert() in those.
        if !has_public_dispatch {
            functions.push(create_revert_dispatch_fn());
        }

        TranspiledContractArtifact {
            transpiled: true,
            noir_version: contract.noir_version,
            name: contract.name,
            functions, // some acir, some transpiled avm functions
            outputs: contract.outputs,
            file_map: contract.file_map,
        }
    }
}

fn create_revert_dispatch_fn() -> AvmOrAcirContractFunctionArtifact {
    let error_string = "No public functions".to_string();
    let error_selector = ErrorType::String(error_string.clone()).selector();

    let revert_bytecode: Vec<u8> = vec![
        // Set revert data len
        AvmInstruction {
            opcode: AvmOpcode::SET_8,
            indirect: Some(AvmOperand::U8 { value: 0 }), // All direct
            tag: Some(AvmTypeTag::UINT32),
            operands: vec![AvmOperand::U8 { value: 0 }], // Address 0
            immediates: vec![AvmOperand::U8 { value: 1 }], // Value 1
        },
        // Set error selector
        AvmInstruction {
            opcode: AvmOpcode::SET_64,
            indirect: Some(AvmOperand::U8 { value: 0 }), // All direct
            tag: Some(AvmTypeTag::UINT64),
            operands: vec![AvmOperand::U16 { value: 1 }], // Address 1
            immediates: vec![AvmOperand::U64 { value: error_selector.as_u64() }], // Value selector
        },
        // Revert
        AvmInstruction {
            opcode: AvmOpcode::REVERT_8,
            indirect: Some(AvmOperand::U8 { value: 0 }), // All direct
            operands: vec![
                AvmOperand::U8 { value: 0 }, // Revert data size address
                AvmOperand::U8 { value: 1 }, // Revert data start address
            ],
            ..Default::default()
        },
    ]
    .into_iter()
    .flat_map(|instruction| instruction.to_bytes())
    .collect();

    let empty_dispatch_fn = AvmContractFunctionArtifact {
        name: "public_dispatch".to_string(),
        is_unconstrained: true,
        custom_attributes: vec!["public".to_string()],
        abi: Abi {
            parameters: vec![AbiParameter {
                name: "selector".to_string(),
                typ: AbiType::Field,
                visibility: noirc_abi::AbiVisibility::Private,
            }],
            return_type: None,
            error_types: BTreeMap::from([(
                error_selector,
                AbiErrorType::String { string: error_string },
            )]),
        },
        bytecode: base64::prelude::BASE64_STANDARD.encode(revert_bytecode),
        debug_symbols: ProgramDebugInfo { debug_infos: vec![DebugInfo::default()] },
        brillig_names: vec!["public_dispatch".to_string()],
    };

    AvmOrAcirContractFunctionArtifact::Avm(empty_dispatch_fn)
}
