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

use acir::brillig::ForeignCallResult;
use acir::circuit::Program;
use acir::native_types::{Witness, WitnessMap};
use acir::{AcirField, FieldElement};
use acvm::pwg::{ACVMStatus, ForeignCallWaitInfo, ACVM};
use bn254_blackbox_solver::Bn254BlackBoxSolver;

/// Signature of a Brillig foreign-call (oracle) resolver: given the pending call, return its result.
/// The backend supplies one — native drives a blocking outbound ipc-runtime client to the resolver
/// service; wasm routes through the `host_call` import. `execute_acir` takes it as a generic
/// `impl ForeignCallResolver` (not `dyn`) on purpose: monomorphization makes the resolve call a
/// *direct* call, so on wasm the whole Asyncify suspend path stays direct and `asyncify-ignore-indirect`
/// (which keeps the Brillig interpreter + crypto uninstrumented) stays sound. It also keeps the ACVM
/// driver straight-line — no `resume` leaks into the model; Asyncify/JSPI handle suspension below here.
pub trait ForeignCallResolver:
    FnMut(&ForeignCallWaitInfo<FieldElement>) -> Result<ForeignCallResult<FieldElement>, String>
{
}
impl<F> ForeignCallResolver for F where
    F: FnMut(&ForeignCallWaitInfo<FieldElement>) -> Result<ForeignCallResult<FieldElement>, String>
{
}

use generated::acvm_server::{Handler, Responder};
use generated::acvm_types::{AcvmExecuteProgram, AcvmExecuteProgramResponse, Bin32, WitnessEntry};

/// Execute a single-function ACIR program against an initial witness and return the solved
/// witness as (index, 32-byte big-endian field) pairs.
///
/// Brillig foreign calls (oracles) are resolved by `resolve_fc`, which the backend supplies (native
/// IPC client or wasm `host_call`). Multi-function programs and ACIR-to-ACIR calls return an
/// explicit error rather than silently diverging.
pub fn execute_acir(
    bytecode: &[u8],
    initial: &[(u32, [u8; 32])],
    mut resolve_fc: impl ForeignCallResolver,
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
                let wait = acvm
                    .get_pending_foreign_call()
                    .expect("status is RequiresForeignCall");
                let result = resolve_fc(wait)?;
                acvm.resolve_pending_foreign_call(result);
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

/// Spike scaffolding (to be removed when Spike 4 lands proper fixtures): a single-oracle circuit
/// borrowed from acvm's `inversion_brillig_oracle_equivalence`:
///
/// ```text
/// fn main(x: Field, y: Field) {
///     let z = x + y;
///     assert(1/z == Oracle("invert", x + y));
/// }
/// ```
///
/// A Brillig function calls `invert(x+y)`; ACIR then constrains the oracle output to equal the field
/// inverse of `x+y`, so a resolver returning the wrong value makes solving fail. Witnesses: w1=x,
/// w2=y (inputs); w3=oracle out; w4=z; w5=1/z; w6=x+y; w7=equality flag.
#[doc(hidden)]
pub fn oracle_invert_program() -> Vec<u8> {
    use acir::brillig::{
        BinaryFieldOp, BitSize, HeapValueType, HeapVector, IntegerBitSize, MemoryAddress,
        Opcode as BrilligOpcode, ValueOrArray,
    };
    use acir::circuit::brillig::BrilligBytecode;
    use acir::circuit::Circuit;

    let (w_x, w_y, w_oracle, w_z, w_z_inv, w_x_plus_y, w_equal) = (
        Witness(1),
        Witness(2),
        Witness(3),
        Witness(4),
        Witness(5),
        Witness(6),
        Witness(7),
    );

    let src = format!(
        "
    BRILLIG CALL func: 0, predicate: 1, inputs: [{w_x} + {w_y}, 0], outputs: [{w_x_plus_y}, {w_oracle}, {w_equal}]
    ASSERT {w_z} = {w_x} + {w_y}
    ASSERT 0 = {w_z}*{w_z_inv} - 1
    ASSERT {w_z_inv} = {w_oracle}
    "
    );
    let opcodes = acir::parse_opcodes(&src).expect("valid acir source");

    let (zero, two, three) = (
        MemoryAddress::direct(3),
        MemoryAddress::direct(4),
        MemoryAddress::direct(5),
    );
    let cst = |dest, v: u64| BrilligOpcode::Const {
        destination: dest,
        bit_size: BitSize::Integer(IntegerBitSize::U32),
        value: FieldElement::from(v),
    };
    let brillig = BrilligBytecode {
        function_name: "invert".to_string(),
        bytecode: vec![
            cst(zero, 0),
            cst(two, 2),
            cst(three, 3),
            BrilligOpcode::CalldataCopy {
                destination_address: MemoryAddress::direct(0),
                size_address: two,
                offset_address: zero,
            },
            BrilligOpcode::BinaryFieldOp {
                op: BinaryFieldOp::Equals,
                lhs: MemoryAddress::direct(0),
                rhs: MemoryAddress::direct(1),
                destination: MemoryAddress::direct(2),
            },
            BrilligOpcode::ForeignCall {
                function: "invert".into(),
                destinations: vec![ValueOrArray::MemoryAddress(MemoryAddress::direct(1))],
                destination_value_types: vec![HeapValueType::field()],
                inputs: vec![ValueOrArray::MemoryAddress(MemoryAddress::direct(0))],
                input_value_types: vec![HeapValueType::field()],
            },
            BrilligOpcode::Stop {
                return_data: HeapVector {
                    pointer: zero,
                    size: three,
                },
            },
        ],
    };

    let circuit = Circuit {
        opcodes,
        ..Default::default()
    };
    let program = Program {
        functions: vec![circuit],
        unconstrained_functions: vec![brillig],
    };
    Program::serialize_program(&program)
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

        // Backend-specific oracle resolver. Wasm routes the foreign call through the (blocking,
        // Asyncify-suspended) `host_call` import; native's outbound ipc-runtime client lands in Spike 2.
        #[cfg(feature = "wasm")]
        let resolve_fc = |wait: &ForeignCallWaitInfo<FieldElement>| {
            let req = rmp_serde::to_vec_named(wait).map_err(|e| format!("serialize fc: {e}"))?;
            let resp = crate::generated::acvm_server::host_call_bytes(crate::ORACLE_TARGET, &req);
            rmp_serde::from_slice::<ForeignCallResult<FieldElement>>(&resp)
                .map_err(|e| format!("deserialize fc result: {e}"))
        };
        // No oracle resolver is configured on this native instance (protocol circuits make no foreign
        // calls). Wiring an outbound resolver client into the handler is a future option — see the
        // native outbound-client pattern in tests/oracle_resolver.rs.
        #[cfg(not(feature = "wasm"))]
        let resolve_fc = |_wait: &ForeignCallWaitInfo<FieldElement>| {
            Err::<ForeignCallResult<FieldElement>, String>(
                "acvm-sim: this instance has no oracle resolver configured; \
                 foreign calls are unsupported here"
                    .to_string(),
            )
        };

        match execute_acir(&cmd.bytecode, &initial, resolve_fc) {
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

/// The `host_call` routing target for acvm-sim's sole outbound dependency, the oracle resolver. The
/// reverse-channel primitive itself (`host_call_bytes` + the `host_call` import) is generated into the
/// server module from the schema's `reverseChannel: true`.
#[cfg(feature = "wasm")]
pub const ORACLE_TARGET: u32 = 0;

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

    /// A resolver that fails if invoked — for circuits that make no foreign calls.
    fn no_oracle(
        _wait: &ForeignCallWaitInfo<FieldElement>,
    ) -> Result<ForeignCallResult<FieldElement>, String> {
        Err("unexpected foreign call".to_string())
    }

    #[test]
    fn executes_addition_circuit() {
        let out = execute_acir(
            &addition_program(),
            &[(0, be32(3)), (1, be32(5))],
            no_oracle,
        )
        .unwrap();
        let w2 = out.iter().find(|(i, _)| *i == 2).expect("w2 solved").1;
        assert_eq!(w2, be32(8));
    }

    #[test]
    fn deserialize_error_is_reported() {
        assert!(execute_acir(&[0xff, 0xff, 0xff], &[], no_oracle).is_err());
    }

    /// Spike 0: the oracle fixture is a valid single-foreign-call circuit, and a resolver that
    /// returns the field inverse of the requested input drives it to a solved witness. Proves the
    /// `execute_acir` resolver-closure path end to end, independent of any backend transport.
    #[test]
    fn executes_oracle_circuit_with_inline_resolver() {
        let resolve = |wait: &ForeignCallWaitInfo<FieldElement>| {
            assert_eq!(wait.function, "invert");
            let input = wait.inputs[0].unwrap_field();
            Ok(ForeignCallResult::from(input.inverse()))
        };
        // x = 2, y = 3 -> z = 5 -> oracle must return 1/5.
        let out = execute_acir(
            &oracle_invert_program(),
            &[(1, be32(2)), (2, be32(3))],
            resolve,
        )
        .unwrap();
        let w_oracle = out.iter().find(|(i, _)| *i == 3).expect("oracle solved").1;
        assert_eq!(w_oracle, field_to_be32(FieldElement::from(5u64).inverse()));
    }

    /// Dump the oracle fixture's bytecode as hex for the wasm spike harness (Spike 3). Run with
    /// `ACVM_DUMP_FIXTURE=<path> cargo test dump_oracle_fixture -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn dump_oracle_fixture() {
        let path = std::env::var("ACVM_DUMP_FIXTURE").expect("set ACVM_DUMP_FIXTURE");
        let hex: String = oracle_invert_program()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        std::fs::write(&path, hex).expect("write fixture");
        eprintln!("wrote oracle fixture to {path}");
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
