//! The Acvm service's handler, shared by the server process, the native library and the wasm module.

use acir::brillig::{ForeignCallParam, ForeignCallResult};
use acir::FieldElement;
use acvm::pwg::ForeignCallWaitInfo;
use acvm::AcirField;

use crate::abi::{self, be32, witness_entries, witness_map};
use crate::executor::{execute, Execution};
use crate::generated::acvm::acvm_server::{Handler, Responder};
use crate::generated::acvm::acvm_types::{
    AcvmAbiDecode, AcvmDecodeAssertionPayload, AcvmDecodeAssertionPayloadResponse, AcvmAbiDecodeResponse,
    AcvmAbiEncode, AcvmAbiEncodeResponse, AcvmCompressWitnessStack,
    AcvmCompressWitnessStackResponse, AcvmDecompressWitnessStack,
    AcvmDecompressWitnessStackResponse, AcvmExecuteProgram, AcvmExecuteProgramResponse,
};
use crate::generated::acvm::host_call_backend::HostCallBackend;
use crate::generated::oracle::backend::Backend;
use crate::generated::oracle::error::{IpcError, Result as OracleResult};
use crate::generated::oracle::oracle_client::OracleApi;
use crate::generated::oracle::oracle_types::{Bin32 as OracleBin32, ForeignCallValue};

/// The host-call target the ACVM reaches the Oracle service by.
pub const ORACLE_HOST_CALL_TARGET: &str = "oracle";

/// The Oracle service at the host's `oracle` target. The acvm module's `HostCallBackend` is the
/// one whose host-call function the FFI exports and the process routing set.
pub struct HostOracle(HostCallBackend);

impl Default for HostOracle {
    fn default() -> Self {
        Self(HostCallBackend::new(ORACLE_HOST_CALL_TARGET))
    }
}

impl Backend for HostOracle {
    fn call(&mut self, input: &[u8]) -> OracleResult<Vec<u8>> {
        use crate::generated::acvm::backend::Backend as _;
        self.0
            .call(input)
            .map_err(|e| IpcError::Backend(e.to_string()))
    }

    fn destroy(&mut self) -> OracleResult<()> {
        Ok(())
    }
}

pub struct AcvmHandler<B: Backend = HostOracle> {
    oracle: OracleApi<B>,
}

impl<B: Backend> AcvmHandler<B> {
    /// A handler whose foreign calls go to `oracle`.
    pub fn new(oracle: B) -> Self {
        Self {
            oracle: OracleApi::new(oracle),
        }
    }
}

impl Default for AcvmHandler {
    fn default() -> Self {
        Self::new(HostOracle::default())
    }
}

impl<B: Backend> Handler for AcvmHandler<B> {
    fn execute_program(
        &mut self,
        cmd: AcvmExecuteProgram,
        respond: Responder<AcvmExecuteProgramResponse>,
    ) {
        let initial_witness = witness_map(&cmd.initial_witness);
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
            return_witness: witness_entries(&solved.return_witness),
            witness: if cmd.return_witness_map {
                witness_entries(solved.main_witness())
            } else {
                Vec::new()
            },
            witness_stack,
            failure: None,
        });
    }

    fn abi_encode(&mut self, cmd: AcvmAbiEncode, respond: Responder<AcvmAbiEncodeResponse>) {
        match abi::abi_encode(
            &cmd.abi_json,
            &cmd.inputs_json,
            cmd.return_value_json.as_deref(),
        ) {
            Ok(witness) => respond.ok(AcvmAbiEncodeResponse {
                witness: witness_entries(&witness),
            }),
            Err(message) => respond.error(message),
        }
    }

    fn abi_decode(&mut self, cmd: AcvmAbiDecode, respond: Responder<AcvmAbiDecodeResponse>) {
        match abi::abi_decode(&cmd.abi_json, &witness_map(&cmd.witness)) {
            Ok(json) => respond.ok(AcvmAbiDecodeResponse { json }),
            Err(message) => respond.error(message),
        }
    }

    fn decode_assertion_payload(
        &mut self,
        cmd: AcvmDecodeAssertionPayload,
        respond: Responder<AcvmDecodeAssertionPayloadResponse>,
    ) {
        match abi::abi_decode_error(&cmd.abi_json, &cmd.payload.selector, &cmd.payload.data) {
            Ok(json) => respond.ok(AcvmDecodeAssertionPayloadResponse { json }),
            Err(message) => respond.error(message),
        }
    }

    fn compress_witness_stack(
        &mut self,
        cmd: AcvmCompressWitnessStack,
        respond: Responder<AcvmCompressWitnessStackResponse>,
    ) {
        match abi::compress_witness_stack(&cmd.stack) {
            Ok(bytes) => respond.ok(AcvmCompressWitnessStackResponse { bytes }),
            Err(message) => respond.error(message),
        }
    }

    fn decompress_witness_stack(
        &mut self,
        cmd: AcvmDecompressWitnessStack,
        respond: Responder<AcvmDecompressWitnessStackResponse>,
    ) {
        match abi::decompress_witness_stack(&cmd.bytes) {
            Ok(stack) => respond.ok(AcvmDecompressWitnessStackResponse { stack }),
            Err(message) => respond.error(message),
        }
    }
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
