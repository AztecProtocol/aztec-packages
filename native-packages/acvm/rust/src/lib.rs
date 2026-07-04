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

/// FFI/wasm entrypoint: exposes the shared `ipc_ffi_entry` C ABI (msgpack in -> msgpack out) that
/// the generated client's wasm/FFI backend calls in-process. The marshalling lives in the generated
/// server module (`--server-ffi`); these are the thin `#[no_mangle]` symbols the host looks up,
/// constructing the stateless `AcvmHandler` per call.
#[cfg(feature = "wasm")]
pub mod wasm_ffi {
    use crate::generated::acvm_server as srv;
    use crate::AcvmHandler;

    #[no_mangle]
    pub extern "C" fn ipc_ffi_alloc(len: usize) -> *mut u8 {
        srv::ffi_alloc(len)
    }

    /// # Safety
    /// `ptr`/`len` must come from `ipc_ffi_alloc` or an `ipc_ffi_entry` output.
    #[no_mangle]
    pub unsafe extern "C" fn ipc_ffi_free(ptr: *mut u8, len: usize) {
        srv::ffi_free(ptr, len)
    }

    /// # Safety
    /// `input_ptr`/`input_len` must describe a valid buffer; the out-pointers must be writable.
    #[no_mangle]
    pub unsafe extern "C" fn ipc_ffi_entry(
        input_ptr: *const u8,
        input_len: usize,
        output_ptr_out: *mut *mut u8,
        output_len_out: *mut usize,
    ) {
        srv::ffi_dispatch(
            &mut AcvmHandler,
            input_ptr,
            input_len,
            output_ptr_out,
            output_len_out,
        );
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

    /// Exercises both branches of the generated `ffi_dispatch` in-out scratch ABI: a large scratch
    /// (response fits, no allocation) and a tiny scratch (falls back to allocation) must produce the
    /// identical response frame.
    #[test]
    fn ffi_dispatch_scratch_and_fallback() {
        use crate::generated::acvm_server::{ffi_dispatch, ffi_free};
        use crate::generated::acvm_types::{AcvmExecuteProgram, Bin32, Command, WitnessEntry};

        let initial = vec![
            WitnessEntry {
                index: 0,
                value: Bin32(be32(3)),
            },
            WitnessEntry {
                index: 1,
                value: Bin32(be32(5)),
            },
        ];
        let request = rmp_serde::to_vec_named(&vec![Command::AcvmExecuteProgram(
            AcvmExecuteProgram::new(addition_program(), initial),
        )])
        .unwrap();

        unsafe fn run(request: &[u8], scratch_cap: usize) -> (Vec<u8>, bool) {
            let mut scratch = vec![0u8; scratch_cap.max(1)];
            let scratch_ptr = scratch.as_mut_ptr();
            let mut out_ptr = scratch_ptr;
            let mut out_len = scratch_cap;
            ffi_dispatch(
                &mut AcvmHandler,
                request.as_ptr(),
                request.len(),
                &mut out_ptr,
                &mut out_len,
            );
            let allocated = out_ptr != scratch_ptr;
            let bytes = std::slice::from_raw_parts(out_ptr, out_len).to_vec();
            if allocated {
                ffi_free(out_ptr, out_len);
            }
            (bytes, allocated)
        }

        unsafe {
            let (fit, alloc_fit) = run(&request, 64 * 1024);
            assert!(!alloc_fit, "response should fit the large scratch");
            let (big, alloc_big) = run(&request, 1);
            assert!(alloc_big, "tiny scratch should force allocation");
            assert_eq!(
                fit, big,
                "both scratch paths must yield the same response frame"
            );
        }
    }
}
