use acvm::brillig_vm::brillig::ForeignCallResult;
use acvm::pwg::{ACVMStatus, ErrorLocation, OpcodeResolutionError, ACVM};
use acvm::BlackBoxFunctionSolver;
use acvm::{acir::circuit::Circuit, acir::native_types::WitnessMap};

use crate::errors::{ACVMError, ExecutionError};

/// Executes a given ACIR circuit with an initial witness, using a black box function solver.
///
/// This function will continuously attempt to solve the circuit until a solution is found or an error occurs.
/// If a foreign call is required, the function currently resolves it with an empty result.
///
/// # Parameters
/// - `blackbox_solver`: A reference to the black box function solver that assists in solving the circuit.
/// - `circuit`: The ACIR circuit that needs to be executed.
/// - `initial_witness`: The initial witness values for the circuit.
///
/// # Returns
/// - `Ok(WitnessMap)`: The solution to the circuit, represented as a `WitnessMap`.
/// - `Err(ACVMError)`: An error encountered during the execution of the circuit.
pub fn execute_circuit<B: BlackBoxFunctionSolver>(
    blackbox_solver: &B,
    circuit: Circuit,
    initial_witness: WitnessMap,
) -> Result<WitnessMap, ACVMError> {
    let mut acvm = ACVM::new(blackbox_solver, &circuit.opcodes, initial_witness);

    loop {
        let solver_status = acvm.solve();

        match solver_status {
            ACVMStatus::Solved => break,
            ACVMStatus::InProgress => {
                unreachable!("Execution should not stop while in `InProgress` state.")
            }
            ACVMStatus::Failure(error) => {
                let call_stack = match &error {
                    OpcodeResolutionError::UnsatisfiedConstrain {
                        opcode_location: ErrorLocation::Resolved(opcode_location),
                    } => Some(vec![*opcode_location]),
                    OpcodeResolutionError::BrilligFunctionFailed { call_stack, .. } => {
                        Some(call_stack.clone())
                    }
                    _ => None,
                };

                return Err(ACVMError::ExecutionError(match call_stack {
                    Some(call_stack) => {
                        if let Some(assert_message) = circuit.get_assert_message(
                            *call_stack.last().expect("Call stacks should not be empty"),
                        ) {
                            ExecutionError::AssertionFailed(assert_message.to_owned(), call_stack)
                        } else {
                            ExecutionError::SolvingError(error)
                        }
                    }
                    None => ExecutionError::SolvingError(error),
                }));
            }
            ACVMStatus::RequiresForeignCall(_foreign_call) => {
                acvm.resolve_pending_foreign_call(ForeignCallResult { values: vec![] });
            }
        }
    }

    let solved_witness = acvm.finalize();
    Ok(solved_witness)
}
