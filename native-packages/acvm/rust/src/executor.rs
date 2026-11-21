//! Solving a program: the main function, the ACIR functions it calls, and the foreign calls their
//! Brillig code makes, as acvm_js's executor does. Foreign calls are awaited, so an execution can
//! wait on its oracles without blocking the instance running it.

use acir::brillig::ForeignCallResult;
use acir::circuit::{Circuit, OpcodeLocation, Program};
use acir::native_types::{WitnessMap, WitnessStack};
use acir::FieldElement;
use acvm::pwg::{
    ACVMStatus, ErrorLocation, ForeignCallWaitInfo, OpcodeResolutionError,
    ResolvedAssertionPayload, ACVM,
};
use acvm::AcirField;
use bn254_blackbox_solver::Bn254BlackBoxSolver;
use serde::Serialize;
use std::future::Future;

use crate::generated::acvm::acvm_types::{ExecutionFailure, RawAssertionPayload};

/// Answers a Brillig foreign call. An `Err` ends the execution as a service error: the call never
/// got an answer, which is not the program failing.
pub trait ForeignCallResolver {
    fn resolve(
        &mut self,
        call: &ForeignCallWaitInfo<FieldElement>,
    ) -> impl Future<Output = Result<ForeignCallResult<FieldElement>, String>>;
}

/// A closure answers at once.
impl<F> ForeignCallResolver for F
where
    F: FnMut(&ForeignCallWaitInfo<FieldElement>) -> Result<ForeignCallResult<FieldElement>, String>,
{
    fn resolve(
        &mut self,
        call: &ForeignCallWaitInfo<FieldElement>,
    ) -> impl Future<Output = Result<ForeignCallResult<FieldElement>, String>> {
        std::future::ready(self(call))
    }
}

/// A solved program: every function's witness, the main function's last.
pub struct Solved {
    pub stack: WitnessStack<FieldElement>,
    /// The main function's solved witness at its return indices.
    pub return_witness: WitnessMap<FieldElement>,
}

impl Solved {
    /// The main function's solved witness.
    pub fn main_witness(&self) -> &WitnessMap<FieldElement> {
        &self
            .stack
            .peek()
            .expect("a solved program has its main function's witness")
            .witness
    }

    /// The stack in the form bb reads a prover's witness: a msgpack-compact format marker, then the
    /// stack, uncompressed. `WitnessStack::serialize` writes the same bytes gzipped.
    pub fn witness_stack_bytes(&self) -> Result<Vec<u8>, String> {
        const MSGPACK_COMPACT: u8 = 3;
        let mut buf = vec![MSGPACK_COMPACT];
        let mut serializer = rmp_serde::Serializer::new(&mut buf)
            .with_bytes(rmp_serde::config::BytesMode::ForceIterables)
            .with_struct_tuple();
        Serialize::serialize(&self.stack, &mut serializer)
            .map_err(|e| format!("could not serialize the witness stack: {e}"))?;
        Ok(buf)
    }
}

/// How an execution ended: solved, or failed in the program (an assertion or a Brillig trap).
pub enum Execution {
    Solved(Solved),
    Failed(ExecutionFailure),
}

/// Solve `bytecode` (as `Program::serialize_program` writes it) from its main function's initial
/// witness. A service error (`Err`) is a program that can't be read or a foreign call that went
/// unanswered; the program failing is `Ok(Execution::Failed)`.
pub async fn execute(
    bytecode: &[u8],
    initial_witness: WitnessMap<FieldElement>,
    resolver: &mut impl ForeignCallResolver,
) -> Result<Execution, String> {
    let program = Program::<FieldElement>::deserialize_program(bytecode)
        .map_err(|e| format!("could not read the program: {e}"))?;
    let solver = Bn254BlackBoxSolver::default();
    let main = program
        .functions
        .first()
        .ok_or_else(|| "the program has no functions".to_string())?;
    let mut stack = WitnessStack::default();
    let witness = match solve(
        &program,
        &solver,
        resolver,
        main,
        initial_witness,
        &mut stack,
    )
    .await?
    {
        Ok(witness) => witness,
        Err(failure) => return Ok(Execution::Failed(failure)),
    };
    let mut return_witness = WitnessMap::new();
    for index in main.return_values.indices() {
        let value = witness
            .get_index(index)
            .ok_or_else(|| format!("return witness {index} is missing from the solved witness"))?;
        return_witness.insert(index.into(), *value);
    }
    stack.push(0, witness);
    Ok(Execution::Solved(Solved {
        stack,
        return_witness,
    }))
}

/// A function being solved: the main function, or an ACIR function a frame below it called.
struct Frame<'a> {
    acvm: ACVM<'a, FieldElement, Bn254BlackBoxSolver>,
    circuit: &'a Circuit<FieldElement>,
    function_id: u32,
}

/// Solve `main` and every ACIR function it calls, each call a frame on an explicit stack (an async
/// function can't recurse without boxing each level). The witnesses of the ACIR calls go on
/// `stack` in the order they finish. The outer `Result` is a service error, the inner one the
/// program failing.
#[allow(clippy::type_complexity)]
async fn solve<'a>(
    program: &'a Program<FieldElement>,
    solver: &'a Bn254BlackBoxSolver,
    resolver: &mut impl ForeignCallResolver,
    main: &'a Circuit<FieldElement>,
    initial_witness: WitnessMap<FieldElement>,
    stack: &mut WitnessStack<FieldElement>,
) -> Result<Result<WitnessMap<FieldElement>, ExecutionFailure>, String> {
    let frame = |circuit: &'a Circuit<FieldElement>, function_id, witness| Frame {
        acvm: ACVM::new(
            solver,
            &circuit.opcodes,
            witness,
            &program.unconstrained_functions,
            &circuit.assert_messages,
        ),
        circuit,
        function_id,
    };
    let mut frames = vec![frame(main, 0, initial_witness)];
    loop {
        let top = frames
            .last_mut()
            .expect("a frame is solving until main returns");
        match top.acvm.solve() {
            ACVMStatus::Solved => {
                let done = frames.pop().expect("the frame just solved");
                let witness = done.acvm.finalize();
                let Some(caller) = frames.last_mut() else {
                    return Ok(Ok(witness));
                };
                let id = done.function_id;
                let outputs = done
                    .circuit
                    .return_values
                    .indices()
                    .into_iter()
                    .map(|index| {
                        witness.get_index(index).copied().ok_or_else(|| {
                            format!("return witness {index} of ACIR function {id} is missing from its solved witness")
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                caller.acvm.resolve_pending_acir_call(outputs);
                stack.push(id, witness);
            }
            ACVMStatus::InProgress => {
                unreachable!("the ACVM never stops while in progress")
            }
            ACVMStatus::Failure(error) => return Ok(Err(failure(error, top.function_id))),
            ACVMStatus::RequiresForeignCall(call) => {
                let result = resolver.resolve(&call).await?;
                top.acvm.resolve_pending_foreign_call(result);
            }
            ACVMStatus::RequiresAcirCall(call) => {
                let id = call.id.as_u32();
                let callee = program.functions.get(call.id.as_usize()).ok_or_else(|| {
                    format!("the program calls ACIR function {id}, which it lacks")
                })?;
                frames.push(frame(callee, id, call.initial_witness));
            }
        }
    }
}

/// The failure as acvm_js reports it: message, call stack, raw assertion payload, function ids.
fn failure(error: OpcodeResolutionError<FieldElement>, acir_function_id: u32) -> ExecutionFailure {
    let call_stack: Option<Vec<OpcodeLocation>> = match &error {
        OpcodeResolutionError::UnsatisfiedConstrain {
            opcode_location: ErrorLocation::Resolved(location),
            ..
        }
        | OpcodeResolutionError::IndexOutOfBounds {
            opcode_location: ErrorLocation::Resolved(location),
            ..
        }
        | OpcodeResolutionError::InvalidInputBitSize {
            opcode_location: ErrorLocation::Resolved(location),
            ..
        } => Some(vec![*location]),
        OpcodeResolutionError::BrilligFunctionFailed { call_stack, .. } => Some(call_stack.clone()),
        _ => None,
    };
    let brillig_function_id = match &error {
        OpcodeResolutionError::BrilligFunctionFailed { function_id, .. } => {
            Some(function_id.as_u32())
        }
        _ => None,
    };
    let (message, raw_assertion_payload) = match error {
        OpcodeResolutionError::UnsatisfiedConstrain {
            payload: Some(payload),
            ..
        }
        | OpcodeResolutionError::BrilligFunctionFailed {
            payload: Some(payload),
            ..
        } => match payload {
            ResolvedAssertionPayload::Raw(raw) => (
                "Assertion failed".to_string(),
                Some(RawAssertionPayload {
                    selector: raw.selector.as_u64().to_string(),
                    data: raw.data.iter().map(|field| field.to_hex()).collect(),
                }),
            ),
            ResolvedAssertionPayload::String(message) => {
                (format!("Assertion failed: {message}"), None)
            }
        },
        other => (other.to_string(), None),
    };
    ExecutionFailure {
        message,
        call_stack: call_stack.map(|locations| {
            locations
                .iter()
                .map(|location| location.to_string())
                .collect()
        }),
        raw_assertion_payload,
        acir_function_id: Some(acir_function_id),
        brillig_function_id,
    }
}
