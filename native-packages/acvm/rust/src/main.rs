//! aztec-acvm: serves the Acvm service over ipc-runtime.
//!
//! Usage: aztec-acvm msgpack run --input <path> [--host-call oracle=<path>]
//!
//! `--input` is where to serve (a socket, or shared memory for a `.shm` path); `--host-call
//! oracle=<path>` is the Oracle server foreign calls go to. Without it, a program making a foreign
//! call fails.
//!
//! On a socket the service runs as an asynchronous instance, re-entrantly on one thread: while an
//! execution waits on the oracle, the server takes other requests, among them an execution the
//! oracle itself starts on this server. Shared memory is not re-entrant: there one request is
//! served at a time, and an oracle call blocks until answered.

use aztec_acvm::generated::acvm::acvm_server::{handle_request, oversized_response, submit_request};
use aztec_acvm::AcvmHandler;
use ipc_runtime::process_host_calls::{host_call_args, route_host_calls, serve_async};
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
    let targets = match host_call_args(&args) {
        Ok(targets) => targets,
        Err(e) => {
            eprintln!("aztec-acvm: {e}");
            std::process::exit(2);
        }
    };

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
    if input.ends_with(".shm") {
        route_host_calls(targets);
        server.set_oversized_response(oversized_response);
        let mut handler = AcvmHandler;
        server.run(|_client_id, request| handle_request(&mut handler, request));
        return;
    }
    if let Err(e) = serve_async(
        &mut server,
        AcvmHandler,
        |handler, request, respond| submit_request(handler, request, respond),
        targets,
    ) {
        eprintln!("aztec-acvm: {e}");
        std::process::exit(1);
    }
}
