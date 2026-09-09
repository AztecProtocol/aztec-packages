//! Echo IPC server — uses GENERATED dispatch + types + ipc-runtime transport.
//! Usage: echo_server --socket /tmp/echo.sock

use echo_wire_compat::handler::EchoHandler;
use ipc_runtime::IpcServer;
use std::cell::RefCell;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let socket_path = args
        .iter()
        .position(|a| a == "--socket")
        .and_then(|i| args.get(i + 1))
        .expect("Usage: echo_server --socket <path>");

    let _ = std::fs::remove_file(socket_path);

    // Wrap handler in RefCell so the FnMut closure can borrow mutably across
    // dispatches.
    let handler = RefCell::new(EchoHandler);

    let mut server = IpcServer::from_path(socket_path).expect("IpcServer::from_path");
    server.install_default_signal_handlers();
    server.listen().expect("IpcServer::listen");

    server.run(|_client_id, payload| {
        echo_wire_compat::generated::echo_server::handle_request(
            &mut *handler.borrow_mut(),
            payload,
        )
    });
}
