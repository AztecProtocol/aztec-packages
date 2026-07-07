//! End-to-end IPC round-trip: spawn the real `acvm-sim` binary, connect with the generated
//! client over a UDS socket, execute a program, and check the solved witness.

use std::process::{Command, Stdio};
use std::time::Duration;

use acir::circuit::{Circuit, Opcode, Program};
use acir::native_types::{Expression, Witness};
use acir::{AcirField, FieldElement};
use acvm_sim::generated::acvm_client::AcvmApi;
use acvm_sim::generated::acvm_types::{Bin32, WitnessEntry};
use ipc_runtime::IpcClient;

/// One-opcode ACIR program enforcing `w0 + w1 - w2 = 0`.
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
fn ipc_round_trip_executes() {
    let sock = format!("/tmp/acvm-sim-rt-{}.sock", std::process::id());
    let _ = std::fs::remove_file(&sock);

    let mut child = Command::new(env!("CARGO_BIN_EXE_acvm-sim"))
        .arg("--input")
        .arg(&sock)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn acvm-sim");

    // The server binds asynchronously; retry the connect until it is listening.
    let backend = (0..100)
        .find_map(|_| match IpcClient::from_path(&sock) {
            Ok(client) => Some(client),
            Err(_) => {
                std::thread::sleep(Duration::from_millis(50));
                None
            }
        })
        .expect("connect to acvm-sim server");

    let mut api = AcvmApi::new(backend);
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

    let resp = api
        .execute_program(&addition_program(), initial)
        .expect("execute_program");
    let w2 = resp
        .witness
        .iter()
        .find(|e| e.index == 2)
        .expect("w2 present");
    assert_eq!(*w2.value.to_bytes(), be32(8));

    let _ = child.kill();
    let _ = std::fs::remove_file(&sock);
}
