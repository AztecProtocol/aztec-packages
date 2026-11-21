//! The echo service's handler, shared by the socket server binary and the
//! in-process FFI (`export_echo_ffi!` in lib.rs).

use crate::generated::async_host::{spawn, AsyncHostCall};
use crate::generated::echo_client::EchoAsyncApi;
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
    // Calls out to the host's "peer" before answering. The future suspends at the await; on an
    // asynchronous instance the host can meanwhile run more requests on this one (the peer's own
    // Relay among them), and the peer's answer resumes it.
    fn relay(&mut self, cmd: EchoRelay, respond: Responder<EchoRelayResponse>) {
        if cmd.hops == 0 {
            return respond.ok(EchoRelayResponse { data: cmd.data });
        }
        spawn(async move {
            let peer = EchoAsyncApi::new(AsyncHostCall::new("peer"));
            let mut data = cmd.data;
            data.push(cmd.hops as u8);
            match peer.relay(&data, cmd.hops - 1).await {
                Ok(answer) => respond.ok(answer),
                Err(e) => respond.error(e.to_string()),
            }
        });
    }
}
