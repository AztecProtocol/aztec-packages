//! The Acvm service's handler, shared by the native server and the wasm module's FFI entry.

use acir::brillig::{ForeignCallParam, ForeignCallResult};
use acir::native_types::{Witness, WitnessMap};
use acir::FieldElement;
use acvm::pwg::ForeignCallWaitInfo;
use acvm::AcirField;

use crate::executor::{execute, Execution};
use crate::generated::acvm::acvm_server::{Handler, Responder};
use crate::generated::acvm::acvm_types::{
    AcvmExecuteProgram, AcvmExecuteProgramResponse, Bin32, WitnessEntry,
};
use crate::generated::oracle::backend::Backend;
use crate::generated::oracle::error::{IpcError, Result as OracleResult};
use crate::generated::oracle::host_call_backend::HostCallBackend;
use crate::generated::oracle::oracle_client::OracleApi;
use crate::generated::oracle::oracle_types::{Bin32 as OracleBin32, ForeignCallValue};

/// The host-call target a wasm module reaches the Oracle service by.
pub const ORACLE_HOST_CALL_TARGET: &str = "oracle";

/// Where foreign calls go.
pub enum OracleBackend {
    /// Nowhere: a program making a foreign call fails with a service error.
    None,
    /// The host's `oracle` host-call target, from a wasm module.
    HostCall(HostCallBackend),
    /// An Oracle server over ipc-runtime (`aztec-acvm --oracle <path>`).
    #[cfg(feature = "ipc-runtime")]
    Ipc(ipc_runtime::IpcClient),
}

impl Backend for OracleBackend {
    fn call(&mut self, input: &[u8]) -> OracleResult<Vec<u8>> {
        match self {
            OracleBackend::None => Err(IpcError::Backend(
                "no Oracle service to answer foreign calls (start aztec-acvm with --oracle <path>)"
                    .to_string(),
            )),
            OracleBackend::HostCall(backend) => backend.call(input),
            #[cfg(feature = "ipc-runtime")]
            OracleBackend::Ipc(client) => Backend::call(client, input),
        }
    }

    fn destroy(&mut self) -> OracleResult<()> {
        Ok(())
    }
}

pub struct AcvmHandler {
    oracle: OracleApi<OracleBackend>,
}

impl AcvmHandler {
    pub fn new(oracle: OracleBackend) -> Self {
        Self {
            oracle: OracleApi::new(oracle),
        }
    }
}

/// A wasm module asks its host; a native one has no Oracle service until given one.
impl Default for AcvmHandler {
    fn default() -> Self {
        Self::new(if cfg!(target_arch = "wasm32") {
            OracleBackend::HostCall(HostCallBackend::new(ORACLE_HOST_CALL_TARGET))
        } else {
            OracleBackend::None
        })
    }
}

impl Handler for AcvmHandler {
    fn execute_program(
        &mut self,
        cmd: AcvmExecuteProgram,
        respond: Responder<AcvmExecuteProgramResponse>,
    ) {
        let mut initial_witness = WitnessMap::new();
        for entry in &cmd.initial_witness {
            initial_witness.insert(
                Witness(entry.index),
                FieldElement::from_be_bytes_reduce(&entry.value.0),
            );
        }
        let execution_id = cmd.execution_id;
        let oracle = &mut self.oracle;
        let mut resolver = |call: &ForeignCallWaitInfo<FieldElement>| {
            let inputs = call.inputs.iter().map(to_wire).collect();
            let response = oracle
                .foreign_call(execution_id, call.function.clone(), inputs)
                .map_err(|e| format!("oracle {}: {e}", call.function))?;
            Ok(ForeignCallResult {
                values: response.outputs.iter().map(from_wire).collect(),
            })
        };
        let solved = match execute(&cmd.bytecode, initial_witness, &mut resolver) {
            Err(message) => return respond.error(message),
            Ok(Execution::Failed(failure)) => {
                return respond.ok(AcvmExecuteProgramResponse {
                    return_witness: Vec::new(),
                    witness: Vec::new(),
                    witness_stack: None,
                    failure: Some(failure),
                })
            }
            Ok(Execution::Solved(solved)) => solved,
        };
        let witness_stack = if cmd.return_witness_stack {
            match solved.witness_stack_bytes() {
                Ok(bytes) => Some(bytes),
                Err(message) => return respond.error(message),
            }
        } else {
            None
        };
        respond.ok(AcvmExecuteProgramResponse {
            return_witness: entries(&solved.return_witness),
            witness: if cmd.return_witness_map {
                entries(solved.main_witness())
            } else {
                Vec::new()
            },
            witness_stack,
            failure: None,
        });
    }
}

fn entries(witness: &WitnessMap<FieldElement>) -> Vec<WitnessEntry> {
    witness
        .clone()
        .into_iter()
        .map(|(index, value)| WitnessEntry {
            index: index.0,
            value: Bin32(be32(value)),
        })
        .collect()
}

fn be32(value: FieldElement) -> [u8; 32] {
    let bytes = value.to_be_bytes();
    let mut out = [0u8; 32];
    out[32 - bytes.len()..].copy_from_slice(&bytes);
    out
}

fn to_wire(param: &ForeignCallParam<FieldElement>) -> ForeignCallValue {
    match param {
        ForeignCallParam::Single(value) => ForeignCallValue {
            values: vec![OracleBin32(be32(*value))],
            array: false,
        },
        ForeignCallParam::Array(values) => ForeignCallValue {
            values: values
                .iter()
                .map(|value| OracleBin32(be32(*value)))
                .collect(),
            array: true,
        },
    }
}

fn from_wire(value: &ForeignCallValue) -> ForeignCallParam<FieldElement> {
    let mut fields = value
        .values
        .iter()
        .map(|field| FieldElement::from_be_bytes_reduce(&field.0));
    if value.array {
        ForeignCallParam::Array(fields.collect())
    } else {
        ForeignCallParam::Single(fields.next().unwrap_or_default())
    }
}
