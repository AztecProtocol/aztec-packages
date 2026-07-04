//! acvm-sim: an msgpack IPC service that executes ACIR programs by calling into the
//! Noir ACVM (`acvm::pwg::ACVM`) in-process, replacing the per-circuit `acvm` CLI spawn.
//!
//! The wire contract is codegen'd from `acvm_schema.jsonc` into `generated/`.

pub mod generated {
    pub mod acvm_client;
    pub mod acvm_server;
    pub mod acvm_types;
    pub mod backend;
    pub mod error;
}

use acir::circuit::Program;
use acir::native_types::{Witness, WitnessMap};
use acir::{AcirField, FieldElement};
use acvm::pwg::{ACVMStatus, ACVM};
use bn254_blackbox_solver::Bn254BlackBoxSolver;

use generated::acvm_server::{Handler, Responder};
use generated::acvm_types::{AcvmExecuteProgram, AcvmExecuteProgramResponse, Bin32, WitnessEntry};

/// Execute a single-function ACIR program against an initial witness and return the solved
/// witness as (index, 32-byte big-endian field) pairs.
///
/// v1 scope mirrors the current native `acvm execute` path (protocol circuits): a single ACIR
/// function with no foreign calls. Foreign/ACIR-call and multi-function programs return an
/// explicit error rather than silently diverging.
pub fn execute_acir(
    bytecode: &[u8],
    initial: &[(u32, [u8; 32])],
) -> Result<Vec<(u32, [u8; 32])>, String> {
    let program = Program::<FieldElement>::deserialize_program(bytecode)
        .map_err(|e| format!("failed to deserialize ACIR program: {e}"))?;

    if program.functions.len() != 1 {
        return Err(format!(
            "acvm-sim v1 supports single-function programs only (got {})",
            program.functions.len()
        ));
    }
    let circuit = &program.functions[0];

    let mut witness = WitnessMap::new();
    for (index, bytes) in initial {
        witness.insert(Witness(*index), FieldElement::from_be_bytes_reduce(bytes));
    }

    let solver = Bn254BlackBoxSolver::default();
    let mut acvm = ACVM::new(
        &solver,
        &circuit.opcodes,
        witness,
        &program.unconstrained_functions,
        &circuit.assert_messages,
    );

    loop {
        match acvm.solve() {
            ACVMStatus::Solved => break,
            ACVMStatus::InProgress => continue,
            ACVMStatus::Failure(err) => return Err(format!("ACIR execution failed: {err:?}")),
            ACVMStatus::RequiresForeignCall(_) => {
                return Err("acvm-sim v1 does not support foreign calls".to_string())
            }
            ACVMStatus::RequiresAcirCall(_) => {
                return Err("acvm-sim v1 does not support ACIR calls".to_string())
            }
        }
    }

    let solved = acvm.finalize();
    Ok(solved
        .into_iter()
        .map(|(w, f)| (w.0, field_to_be32(f)))
        .collect())
}

/// Left-pad a field element's big-endian bytes to a fixed 32-byte array.
fn field_to_be32(value: FieldElement) -> [u8; 32] {
    let be = value.to_be_bytes();
    let mut arr = [0u8; 32];
    let n = be.len().min(32);
    arr[32 - n..].copy_from_slice(&be[be.len() - n..]);
    arr
}

/// Handler backing the generated `Acvm` IPC service.
pub struct AcvmHandler;

impl Handler for AcvmHandler {
    fn execute_program(
        &mut self,
        cmd: AcvmExecuteProgram,
        respond: Responder<AcvmExecuteProgramResponse>,
    ) {
        let initial: Vec<(u32, [u8; 32])> = cmd
            .initial_witness
            .iter()
            .map(|e| (e.index, *e.value.to_bytes()))
            .collect();

        match execute_acir(&cmd.bytecode, &initial) {
            Ok(entries) => {
                let witness = entries
                    .into_iter()
                    .map(|(index, bytes)| WitnessEntry {
                        index,
                        value: Bin32(bytes),
                    })
                    .collect();
                respond.ok(AcvmExecuteProgramResponse { witness });
            }
            Err(message) => respond.error(message),
        }
    }
}

/// FFI/wasm backend entrypoint: the same msgpack request/response contract as the IPC server,
/// exposed as a single C symbol (`ipc_ffi_entry`) that the generated client's FFI/wasm backend
/// calls in-process. The host allocates input space via `ipc_ffi_alloc`, writes the request,
/// calls `ipc_ffi_entry`, reads the returned `(ptr, len)`, then frees both with `ipc_ffi_free`.
/// This mirrors ipc-codegen's client-side `ffi_backend` ABI; it will be moved into a codegen
/// template (see plan) — kept here for now to prove the wasm backend end to end.
#[cfg(feature = "wasm")]
pub mod wasm_ffi {
    use crate::generated::acvm_server::handle_request;
    use crate::AcvmHandler;

    /// Allocate `len` bytes in linear memory for the host to write a request into.
    #[no_mangle]
    pub extern "C" fn ipc_ffi_alloc(len: usize) -> *mut u8 {
        let mut buf = Vec::<u8>::with_capacity(len);
        let ptr = buf.as_mut_ptr();
        std::mem::forget(buf);
        ptr
    }

    /// Free a buffer (input or output) of `len` bytes previously produced by alloc/entry.
    ///
    /// # Safety
    /// `ptr`/`len` must come from `ipc_ffi_alloc` or an `ipc_ffi_entry` output.
    #[no_mangle]
    pub unsafe extern "C" fn ipc_ffi_free(ptr: *mut u8, len: usize) {
        if !ptr.is_null() {
            drop(Vec::from_raw_parts(ptr, 0, len));
        }
    }

    /// Decode a msgpack request frame, dispatch it, and write the msgpack response frame's
    /// `(ptr, len)` into the out-params. The host owns the returned buffer and must free it.
    ///
    /// # Safety
    /// `input_ptr`/`input_len` must describe a valid buffer; the out-pointers must be writable.
    #[no_mangle]
    pub unsafe extern "C" fn ipc_ffi_entry(
        input_ptr: *const u8,
        input_len: usize,
        output_ptr_out: *mut *mut u8,
        output_len_out: *mut usize,
    ) {
        let request = std::slice::from_raw_parts(input_ptr, input_len);
        let mut handler = AcvmHandler;
        let mut response = handle_request(&mut handler, request);
        response.shrink_to_fit();
        let len = response.len();
        let ptr = response.as_mut_ptr();
        std::mem::forget(response);
        *output_ptr_out = ptr;
        *output_len_out = len;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use acir::circuit::{Circuit, Opcode, Program};
    use acir::native_types::Expression;

    /// Serialize a one-opcode ACIR program enforcing `w0 + w1 - w2 = 0`.
    fn addition_program() -> Vec<u8> {
        let one = FieldElement::one();
        let expr = Expression {
            linear_combinations: vec![(one, Witness(0)), (one, Witness(1)), (-one, Witness(2))],
            ..Default::default()
        };
        let circuit = Circuit {
            opcodes: vec![Opcode::AssertZero(expr)],
            ..Default::default()
        };
        let program = Program {
            functions: vec![circuit],
            unconstrained_functions: vec![],
        };
        Program::serialize_program(&program)
    }

    fn be32(n: u8) -> [u8; 32] {
        let mut b = [0u8; 32];
        b[31] = n;
        b
    }

    #[test]
    fn executes_addition_circuit() {
        let out = execute_acir(&addition_program(), &[(0, be32(3)), (1, be32(5))]).unwrap();
        let w2 = out.iter().find(|(i, _)| *i == 2).expect("w2 solved").1;
        assert_eq!(w2, be32(8));
    }

    #[test]
    fn deserialize_error_is_reported() {
        assert!(execute_acir(&[0xff, 0xff, 0xff], &[]).is_err());
    }
}
