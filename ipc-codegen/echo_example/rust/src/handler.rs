//! The echo service's handler, shared by the socket server binary and the
//! in-process FFI entry (`export_echo_ffi!` in lib.rs).

use crate::generated::echo_server::{Handler, Responder};
use crate::generated::echo_types::*;

#[derive(Default)]
pub struct EchoHandler;

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
