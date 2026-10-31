//! The aztec-acvm binary, spawned and called over ipc-runtime, its foreign calls answered by an
//! Oracle server the test serves.

mod common;

use std::process::{Child, Command};
use std::sync::{Arc, Mutex};

use aztec_acvm::generated::acvm::acvm_client::AcvmApi;
use aztec_acvm::generated::acvm::acvm_types::{Bin32, WitnessEntry};
use aztec_acvm::generated::oracle::oracle_server::{handle_request, Handler, Responder};
use aztec_acvm::generated::oracle::oracle_types::{
    Bin32 as OracleBin32, ForeignCallValue, OracleForeignCall, OracleForeignCallResponse,
};
use common::bytecode;
use ipc_runtime::{IpcClient, IpcServer};

/// The `oracles` program's oracles, recording the execution id each call came with.
struct Oracles {
    execution_ids: Arc<Mutex<Vec<u64>>>,
}

fn int(field: &OracleBin32) -> u128 {
    u128::from_be_bytes(field.0[16..].try_into().unwrap())
}

fn fr(value: u128) -> OracleBin32 {
    let mut bytes = [0u8; 32];
    bytes[16..].copy_from_slice(&value.to_be_bytes());
    OracleBin32(bytes)
}

impl Handler for Oracles {
    fn foreign_call(
        &mut self,
        cmd: OracleForeignCall,
        respond: Responder<OracleForeignCallResponse>,
    ) {
        self.execution_ids.lock().unwrap().push(cmd.execution_id);
        let outputs = match cmd.name.as_str() {
            "double" => {
                vec![ForeignCallValue {
                    values: vec![fr(2 * int(&cmd.inputs[0].values[0]))],
                    array: false,
                }]
            }
            "sum_and_reverse" => {
                let xs = &cmd.inputs[0].values;
                vec![
                    ForeignCallValue {
                        values: vec![fr(xs.iter().map(int).sum())],
                        array: false,
                    },
                    ForeignCallValue {
                        values: xs.iter().rev().cloned().collect(),
                        array: true,
                    },
                ]
            }
            other => return respond.error(format!("no oracle {other}")),
        };
        respond.ok(OracleForeignCallResponse { outputs });
    }
}

fn socket(name: &str) -> String {
    let path = std::env::temp_dir().join(format!(
        "aztec-acvm-test-{}-{name}.sock",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&path);
    path.to_string_lossy().into_owned()
}

/// Serve the oracles on `path` for the rest of the test process.
fn serve_oracles(path: &str) -> Arc<Mutex<Vec<u64>>> {
    let execution_ids = Arc::new(Mutex::new(Vec::new()));
    let mut handler = Oracles {
        execution_ids: execution_ids.clone(),
    };
    let mut server = IpcServer::from_path(path).unwrap();
    server.listen().unwrap();
    std::thread::spawn(move || server.run(|_, request| handle_request(&mut handler, request)));
    execution_ids
}

struct Acvm {
    child: Child,
    api: AcvmApi<IpcClient>,
}

impl Acvm {
    fn spawn(name: &str, oracle: Option<&str>) -> Self {
        let input = socket(name);
        let mut args = vec!["msgpack", "run", "--input", input.as_str()];
        if let Some(oracle) = oracle {
            args.extend(["--oracle", oracle]);
        }
        let child = Command::new(env!("CARGO_BIN_EXE_aztec-acvm"))
            .args(&args)
            .spawn()
            .unwrap();
        // The client retries its connect while the server comes up.
        let api = AcvmApi::new(IpcClient::from_path(&input).unwrap());
        Acvm { child, api }
    }
}

impl Drop for Acvm {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn entries(values: &[u128]) -> Vec<WitnessEntry> {
    values
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let mut bytes = [0u8; 32];
            bytes[16..].copy_from_slice(&value.to_be_bytes());
            WitnessEntry {
                index: index as u32,
                value: Bin32(bytes),
            }
        })
        .collect()
}

fn value(entry: &WitnessEntry) -> u128 {
    u128::from_be_bytes(entry.value.0[16..].try_into().unwrap())
}

#[test]
fn foreign_calls_reach_the_oracle_server_with_their_execution_id() {
    let oracle = socket("oracle");
    let execution_ids = serve_oracles(&oracle);
    let mut acvm = Acvm::spawn("with-oracle", Some(&oracle));

    let response = acvm
        .api
        .execute_program(7, &bytecode("oracles"), entries(&[4, 1, 2, 3]), true, true)
        .unwrap();
    assert!(response.failure.is_none());
    assert_eq!(
        response
            .return_witness
            .iter()
            .map(value)
            .collect::<Vec<_>>(),
        vec![14]
    );
    assert_eq!(
        &response.witness[..4].iter().map(value).collect::<Vec<_>>(),
        &[4, 1, 2, 3]
    );
    let stack = response.witness_stack.expect("asked for");
    assert_eq!(stack[0], 3, "msgpack-compact, uncompressed");
    assert_eq!(*execution_ids.lock().unwrap(), vec![7, 7]);
}

#[test]
fn without_an_oracle_server_programs_without_foreign_calls_still_solve() {
    let mut acvm = Acvm::spawn("without-oracle", None);

    let error = acvm
        .api
        .execute_program(
            1,
            &bytecode("oracles"),
            entries(&[4, 1, 2, 3]),
            false,
            false,
        )
        .expect_err("a foreign call with nowhere to go is a service error");
    assert!(error.to_string().contains("no Oracle service"), "{error}");

    // The service carries on.
    let response = acvm
        .api
        .execute_program(2, &bytecode("simple"), entries(&[3, 5]), false, false)
        .unwrap();
    assert_eq!(
        response
            .return_witness
            .iter()
            .map(value)
            .collect::<Vec<_>>(),
        vec![16]
    );
    assert!(
        response.witness.is_empty() && response.witness_stack.is_none(),
        "not asked for"
    );

    let failed = acvm
        .api
        .execute_program(3, &bytecode("simple"), entries(&[4, 4]), false, false)
        .unwrap();
    assert!(
        failed.failure.is_some(),
        "x != y fails the program, not the service"
    );
}
