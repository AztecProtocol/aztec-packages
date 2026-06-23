//! Echo IPC server — uses GENERATED dispatch + types + ipc-runtime transport.
//! Usage: echo_server --socket /tmp/echo.sock

use echo_wire_compat::generated::echo_server::{Handler, Responder};
use echo_wire_compat::generated::echo_types::*;
use ipc_runtime::IpcServer;
use std::cell::RefCell;

struct EchoHandler;

// Handlers are asynchronous: they produce their result via respond.ok(...) /
// respond.error(...) (synchronously here; an async transport could defer and
// respond later from another thread).
impl Handler for EchoHandler {
    fn bytes(&mut self, cmd: EchoBytes, respond: Responder<EchoBytesResponse>) {
        respond.ok(EchoBytesResponse { data: cmd.data });
    }
    fn fields(&mut self, cmd: EchoFields, respond: Responder<EchoFieldsResponse>) {
        respond.ok(EchoFieldsResponse {
            a: cmd.a,
            b: cmd.b,
            name: cmd.name,
        });
    }
    fn nested(&mut self, cmd: EchoNested, respond: Responder<EchoNestedResponse>) {
        respond.ok(EchoNestedResponse { inner: cmd.inner });
    }
    fn aliases(&mut self, cmd: EchoAliases, respond: Responder<EchoAliasesResponse>) {
        respond.ok(EchoAliasesResponse {
            tree_id: cmd.tree_id,
            hash: cmd.hash,
            maybe_hash: cmd.maybe_hash,
            hashes: cmd.hashes,
        });
    }
    fn blobs(&mut self, cmd: EchoBlobs, respond: Responder<EchoBlobsResponse>) {
        respond.ok(EchoBlobsResponse {
            maybe_data: cmd.maybe_data,
            parts: cmd.parts,
        });
    }
    fn fail(&mut self, cmd: EchoFail, respond: Responder<EchoFailResponse>) {
        respond.error(cmd.message);
    }
}

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
