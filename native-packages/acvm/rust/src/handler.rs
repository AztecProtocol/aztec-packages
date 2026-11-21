//! The Acvm service's handler, shared by the server process, the native library and the wasm module.

use acir::brillig::{ForeignCallParam, ForeignCallResult};
use acir::FieldElement;
use acvm::pwg::ForeignCallWaitInfo;
use acvm::AcirField;
use std::future::Future;

use crate::abi::{self, be32, witness_entries, witness_map};
use crate::executor::{execute, Execution, ForeignCallResolver};
use crate::generated::acvm::acvm_server::{Handler, Responder};
use crate::generated::acvm::acvm_types::{
    AcvmAbiDecode, AcvmAbiDecodeResponse, AcvmAbiEncode, AcvmAbiEncodeResponse,
    AcvmCompressWitnessStack, AcvmCompressWitnessStackResponse, AcvmDecodeAssertionPayload,
    AcvmDecodeAssertionPayloadResponse, AcvmDecompressWitnessStack,
    AcvmDecompressWitnessStackResponse, AcvmExecuteProgram, AcvmExecuteProgramResponse,
};
use crate::generated::acvm::async_host::{spawn, AsyncHostCall};
use crate::generated::oracle::backend::AsyncBackend;
use crate::generated::oracle::error::{IpcError, Result as OracleResult};
use crate::generated::oracle::oracle_client::OracleAsyncApi;
use crate::generated::oracle::oracle_types::{Bin32 as OracleBin32, ForeignCallValue};

/// The host-call target the ACVM reaches the Oracle service by.
pub const ORACLE_HOST_CALL_TARGET: &str = "oracle";

/// The Oracle service at the host's `oracle` target. On an asynchronous instance (the napi, wasm
/// and JSI hosts) an execution awaiting it suspends, and the instance takes other requests
/// meanwhile, one the oracle itself makes back into the ACVM included. Anywhere else (the server
/// process, the synchronous backends) the call blocks until answered.
pub struct HostOracle(AsyncHostCall);

impl Default for HostOracle {
    fn default() -> Self {
        Self(AsyncHostCall::new(ORACLE_HOST_CALL_TARGET))
    }
}

impl AsyncBackend for HostOracle {
    fn call(&self, input: Vec<u8>) -> impl Future<Output = OracleResult<Vec<u8>>> {
        use crate::generated::acvm::backend::AsyncBackend as _;
        let answer = self.0.call(input);
        async move { answer.await.map_err(|e| IpcError::Backend(e.to_string())) }
    }
}

/// An execution's foreign calls, sent to the Oracle service with the execution's id.
struct OracleResolver {
    oracle: OracleAsyncApi<HostOracle>,
    execution_id: u64,
}

impl ForeignCallResolver for OracleResolver {
    fn resolve(
        &mut self,
        call: &ForeignCallWaitInfo<FieldElement>,
    ) -> impl Future<Output = Result<ForeignCallResult<FieldElement>, String>> {
        let name = call.function.clone();
        let inputs: Vec<ForeignCallValue> = call.inputs.iter().map(to_wire).collect();
        async move {
            let response = self
                .oracle
                .foreign_call(self.execution_id, name.clone(), inputs)
                .await
                .map_err(|e| format!("oracle {name}: {e}"))?;
            Ok(ForeignCallResult {
                values: response.outputs.iter().map(from_wire).collect(),
            })
        }
    }
}

#[derive(Default)]
pub struct AcvmHandler;

impl Handler for AcvmHandler {
    fn execute_program(
        &mut self,
        cmd: AcvmExecuteProgram,
        respond: Responder<AcvmExecuteProgramResponse>,
    ) {
        spawn(async move {
            let mut resolver = OracleResolver {
                oracle: OracleAsyncApi::new(HostOracle::default()),
                execution_id: cmd.execution_id,
            };
            let execution = execute(
                &cmd.bytecode,
                witness_map(&cmd.initial_witness),
                &mut resolver,
            )
            .await;
            match response(&cmd, execution) {
                Ok(response) => respond.ok(response),
                Err(message) => respond.error(message),
            }
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

/// What ExecuteProgram answers with, given how the execution ended.
fn response(
    cmd: &AcvmExecuteProgram,
    execution: Result<Execution, String>,
) -> Result<AcvmExecuteProgramResponse, String> {
    let solved = match execution? {
        Execution::Failed(failure) => {
            return Ok(AcvmExecuteProgramResponse {
                return_witness: Vec::new(),
                witness: Vec::new(),
                witness_stack: None,
                failure: Some(failure),
            })
        }
        Execution::Solved(solved) => solved,
    };
    let witness_stack = if cmd.return_witness_stack {
        Some(solved.witness_stack_bytes()?)
    } else {
        None
    };
    Ok(AcvmExecuteProgramResponse {
        return_witness: witness_entries(&solved.return_witness),
        witness: if cmd.return_witness_map {
            witness_entries(solved.main_witness())
        } else {
            Vec::new()
        },
        witness_stack,
        failure: None,
    })
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
