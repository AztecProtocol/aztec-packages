//! Solving a program: the main function, the ACIR functions it calls, and the foreign calls their
//! Brillig code makes, as acvm_js's executor does.

use acir::brillig::ForeignCallResult;
use acir::circuit::{brillig::BrilligBytecode, Circuit, OpcodeLocation, Program};
use acir::native_types::{WitnessMap, WitnessStack};
use acir::FieldElement;
use acvm::pwg::{
    ACVMStatus, ErrorLocation, ForeignCallWaitInfo, OpcodeResolutionError,
    ResolvedAssertionPayload, ACVM,
};
use acvm::AcirField;
use bn254_blackbox_solver::Bn254BlackBoxSolver;
use serde::Serialize;

use crate::generated::acvm::acvm_types::{ExecutionFailure, RawAssertionPayload};

/// Answers a Brillig foreign call. An `Err` ends the execution as a service error: the call never
/// got an answer, which is not the program failing.
pub trait ForeignCallResolver {
    fn resolve(
        &mut self,
        call: &ForeignCallWaitInfo<FieldElement>,
    ) -> Result<ForeignCallResult<FieldElement>, String>;
}

impl<F> ForeignCallResolver for F
where
    F: FnMut(&ForeignCallWaitInfo<FieldElement>) -> Result<ForeignCallResult<FieldElement>, String>,
{
    fn resolve(
        &mut self,
        call: &ForeignCallWaitInfo<FieldElement>,
    ) -> Result<ForeignCallResult<FieldElement>, String> {
        self(call)
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
pub fn execute(
    bytecode: &[u8],
    initial_witness: WitnessMap<FieldElement>,
    resolver: &mut impl ForeignCallResolver,
) -> Result<Execution, String> {
    let program = Program::<FieldElement>::deserialize_program(bytecode)
        .map_err(|e| format!("could not read the program: {e}"))?;
    let solver = Bn254BlackBoxSolver::default();
    let mut executor = Executor {
        functions: &program.functions,
        unconstrained_functions: &program.unconstrained_functions,
        solver: &solver,
        resolver,
        stack: WitnessStack::default(),
    };
    let main = executor
        .functions
        .first()
        .ok_or_else(|| "the program has no functions".to_string())?;
    let witness = match executor.execute_circuit(main, 0, initial_witness)? {
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
    let mut stack = executor.stack;
    stack.push(0, witness);
    Ok(Execution::Solved(Solved {
        stack,
        return_witness,
    }))
}

struct Executor<'a, R> {
    functions: &'a [Circuit<FieldElement>],
    unconstrained_functions: &'a [BrilligBytecode<FieldElement>],
    solver: &'a Bn254BlackBoxSolver,
    resolver: &'a mut R,
    /// The witnesses of the ACIR calls solved so far, in the order they finished.
    stack: WitnessStack<FieldElement>,
}

impl<R: ForeignCallResolver> Executor<'_, R> {
    /// Solve one function. The outer `Result` is a service error, the inner one the program failing.
    #[allow(clippy::type_complexity)]
    fn execute_circuit(
        &mut self,
        circuit: &Circuit<FieldElement>,
        function_id: u32,
        initial_witness: WitnessMap<FieldElement>,
    ) -> Result<Result<WitnessMap<FieldElement>, ExecutionFailure>, String> {
        let mut acvm = ACVM::new(
            self.solver,
            &circuit.opcodes,
            initial_witness,
            self.unconstrained_functions,
            &circuit.assert_messages,
        );
        loop {
            match acvm.solve() {
                ACVMStatus::Solved => break,
                ACVMStatus::InProgress => {
                    unreachable!("the ACVM never stops while in progress")
                }
                ACVMStatus::Failure(error) => return Ok(Err(failure(error, function_id))),
                ACVMStatus::RequiresForeignCall(call) => {
                    let result = self.resolver.resolve(&call)?;
                    acvm.resolve_pending_foreign_call(result);
                }
                ACVMStatus::RequiresAcirCall(call) => {
                    let id = call.id.as_u32();
                    let callee = self.functions.get(call.id.as_usize()).ok_or_else(|| {
                        format!("the program calls ACIR function {id}, which it lacks")
                    })?;
                    let witness = match self.execute_circuit(callee, id, call.initial_witness)? {
                        Ok(witness) => witness,
                        Err(failure) => return Ok(Err(failure)),
                    };
                    let outputs = callee
                        .return_values
                        .indices()
                        .into_iter()
                        .map(|index| {
                            witness.get_index(index).copied().ok_or_else(|| {
                                format!("return witness {index} of ACIR function {id} is missing from its solved witness")
                            })
                        })
                        .collect::<Result<Vec<_>, _>>()?;
                    acvm.resolve_pending_acir_call(outputs);
                    self.stack.push(id, witness);
                }
            }
        }
        Ok(Ok(acvm.finalize()))
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
