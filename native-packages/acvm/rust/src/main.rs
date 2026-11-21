//! aztec-acvm: serves the Acvm service over ipc-runtime.
//!
//! Usage: aztec-acvm msgpack run --input <path> [--host-call oracle=<path>]
//!
//! `--input` is where to serve (a socket, or shared memory for a `.shm` path); `--host-call
//! oracle=<path>` is the Oracle server foreign calls go to. Without it, a program making a foreign
//! call fails.

use aztec_acvm::generated::acvm::acvm_server::handle_request;
use aztec_acvm::generated::acvm::process_host_calls::{host_call_args, route_host_calls};
use aztec_acvm::AcvmHandler;
use ipc_runtime::IpcServer;

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let usage = "usage: aztec-acvm msgpack run --input <path> [--host-call oracle=<path>]";
    if args.len() < 2 || args[0] != "msgpack" || args[1] != "run" {
        eprintln!("{usage}");
        std::process::exit(2);
    }
    let Some(input) = arg(&args, "--input") else {
        eprintln!("{usage}");
        std::process::exit(2);
    };
    match host_call_args(&args) {
        Ok(targets) => route_host_calls(targets),
        Err(e) => {
            eprintln!("aztec-acvm: {e}");
            std::process::exit(2);
        }
    }
    let mut handler = AcvmHandler;

    let mut server = match IpcServer::from_path(&input) {
        Ok(server) => server,
        Err(e) => {
            eprintln!("aztec-acvm: could not serve on {input}: {e}");
            std::process::exit(1);
        }
    };
    server.install_default_signal_handlers();
    if let Err(e) = server.listen() {
        eprintln!("aztec-acvm: could not listen on {input}: {e}");
        std::process::exit(1);
    }
    server.run(|_client_id, request| handle_request(&mut handler, request));
}
