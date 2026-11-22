//! Echo IPC server — uses GENERATED dispatch + types + ipc-runtime transport.
//! Usage: echo_server --socket /tmp/echo.sock [--host-call peer=<path>]...
//!
//! On a socket it is served as an asynchronous instance, re-entrantly on one thread, so a Relay whose
//! "peer" calls back into this server (as tests/serve_async.rs binds it) is answered while the
//! hops before it wait. Shared memory is not re-entrant: there it serves one request at a time, its
//! host calls blocking.

use echo_wire_compat::generated::echo_server::{handle_request, submit_request};
use echo_wire_compat::handler::EchoHandler;
use ipc_runtime::process_host_calls::{host_call_args, route_host_calls, serve_async};
use ipc_runtime::IpcServer;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let socket_path = args
        .iter()
        .position(|a| a == "--socket")
        .and_then(|i| args.get(i + 1))
        .expect("Usage: echo_server --socket <path> [--host-call name=path]...");
    let targets = host_call_args(&args).unwrap_or_else(|e| panic!("{e}"));

    let _ = std::fs::remove_file(socket_path);

    let mut server = IpcServer::from_path(socket_path).expect("IpcServer::from_path");
    server.install_default_signal_handlers();
    server.listen().expect("IpcServer::listen");

    if socket_path.ends_with(".shm") {
        route_host_calls(targets);
        let mut handler = EchoHandler;
        server.run(|_client_id, request| handle_request(&mut handler, request));
        return;
    }
    if let Err(e) = serve_async(
        &mut server,
        EchoHandler,
        |handler, request, respond| submit_request(handler, request, respond),
        targets,
    ) {
        eprintln!("echo_server: {e}");
        std::process::exit(1);
    }
}
