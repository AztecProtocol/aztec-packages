//! Echo IPC server — uses GENERATED dispatch + types + ipc-runtime transport.
//! Usage: echo_server --socket /tmp/echo.sock [--host-call peer=<path>]...
//!
//! Served as an asynchronous instance, so a Relay whose "peer" calls back into this server (as the
//! TS package's tests bind it) is answered while the hops before it wait.

use echo_wire_compat::generated::echo_server::submit_request;
use echo_wire_compat::generated::process_host_calls::{host_call_args, serve_async};
use echo_wire_compat::handler::EchoHandler;
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

    serve_async(
        &mut server,
        EchoHandler,
        |handler, request, respond| submit_request(handler, request, respond),
        targets,
    );
}
