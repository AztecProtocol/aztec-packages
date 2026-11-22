//! A handler's mistakes stay inside the service: a panic, or a responder dropped without an answer,
//! comes back to the caller as an error response saying so, and never unwinds out through the FFI
//! or leaves the caller waiting.

use echo_wire_compat::generated::echo_client::{EchoApi, EchoAsyncApi};
use echo_wire_compat::generated::echo_server::{handle_request, submit_request, Handler, Responder};
use echo_wire_compat::generated::echo_types::*;
use ipc_runtime::async_host::{spawn, AsyncHost, AsyncHostCall, AsyncInstance};
use ipc_runtime::backend::Backend;
use ipc_runtime::error::Result;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct Faulty;

impl Handler for Faulty {
    fn bytes(&mut self, cmd: EchoBytes, _respond: Responder<EchoBytesResponse>) {
        panic!("boom after {} bytes", cmd.data.len());
    }
    fn fields(&mut self, _cmd: EchoFields, respond: Responder<EchoFieldsResponse>) {
        drop(respond);
    }
    fn nested(&mut self, cmd: EchoNested, respond: Responder<EchoNestedResponse>) {
        respond.ok(EchoNestedResponse { inner: cmd.inner });
    }
    fn aliases(&mut self, _cmd: EchoAliases, _respond: Responder<EchoAliasesResponse>) {
        unreachable!()
    }
    fn blobs(&mut self, _cmd: EchoBlobs, _respond: Responder<EchoBlobsResponse>) {
        unreachable!()
    }
    fn fail(&mut self, cmd: EchoFail, respond: Responder<EchoFailResponse>) {
        respond.error(cmd.message);
    }
    // Panics once its host call has been answered, inside a later `deliver`.
    fn relay(&mut self, cmd: EchoRelay, respond: Responder<EchoRelayResponse>) {
        spawn(async move {
            let _ = EchoAsyncApi::new(AsyncHostCall::new("peer")).relay(&cmd.data, 0).await;
            if cmd.hops > 0 {
                panic!("after the host call");
            }
            respond.ok(EchoRelayResponse { data: cmd.data });
        });
    }
}

/// The generated client over `handle_request` on a [`Faulty`], as the sync FFI runs it.
struct Direct(Faulty);

impl Backend for Direct {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        Ok(handle_request(&mut self.0, input))
    }
    fn destroy(&mut self) -> Result<()> {
        Ok(())
    }
}

#[test]
fn a_panicking_handler_answers_with_the_panic() {
    let mut api = EchoApi::new(Direct(Faulty));
    let message = api.bytes(&[1, 2, 3]).expect_err("the handler panicked").to_string();
    assert!(message.contains("the handler panicked: boom after 3 bytes"), "{message}");
    // The instance keeps serving.
    assert!(api.fail("no".into()).expect_err("an error response").to_string().contains("no"));
}

#[test]
fn a_dropped_responder_answers_with_an_error() {
    let mut api = EchoApi::new(Direct(Faulty));
    let message = api.fields(1, 2, "x".into()).expect_err("no answer").to_string();
    assert!(message.contains("dropped its responder without answering"), "{message}");
}

/// Records what an asynchronous instance hands its host.
#[derive(Default)]
struct Recorder {
    responses: Mutex<Vec<(u64, Vec<u8>)>>,
    calls: Mutex<Vec<u64>>,
}

impl AsyncHost for Recorder {
    fn respond(&self, request_id: u64, response: &[u8]) {
        self.responses.lock().unwrap().push((request_id, response.to_vec()));
    }
    fn call(&self, call_id: u64, _target: &str, _request: &[u8]) {
        self.calls.lock().unwrap().push(call_id);
    }
}

/// The request bytes the generated client sends for `f`.
fn request_of(f: impl FnOnce(&mut EchoApi<Capture>)) -> Vec<u8> {
    let sent = Arc::new(Mutex::new(Vec::new()));
    f(&mut EchoApi::new(Capture(sent.clone())));
    let bytes = std::mem::take(&mut *sent.lock().unwrap());
    bytes
}

struct Capture(Arc<Mutex<Vec<u8>>>);

impl Backend for Capture {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        *self.0.lock().unwrap() = input.to_vec();
        Err(ipc_runtime::error::IpcError::Backend("captured".into()))
    }
    fn destroy(&mut self) -> Result<()> {
        Ok(())
    }
}

#[test]
fn an_asynchronous_handler_that_panics_after_a_host_call_answers_with_the_panic() {
    let host = Arc::new(Recorder::default());
    let mut instance = AsyncInstance::new(Faulty, host.clone(), |h: &mut Faulty, r, raw| submit_request(h, r, raw));
    instance.submit(7, &request_of(|api| drop(api.relay(&[1], 1))));
    let call_id = *host.calls.lock().unwrap().first().expect("the handler called out");
    assert!(host.responses.lock().unwrap().is_empty());

    instance.deliver(call_id, 1, b"no peer");
    let responses = host.responses.lock().unwrap();
    assert_eq!(responses.len(), 1, "answered once");
    let (id, frame) = &responses[0];
    assert_eq!(*id, 7);
    let text = String::from_utf8_lossy(frame);
    assert!(text.contains("the handler panicked: after the host call"), "{text}");
    drop(responses);

    // The instance keeps serving.
    instance.submit(8, &request_of(|api| drop(api.nested(EchoInner { values: vec![], flag: None }))));
    assert_eq!(host.responses.lock().unwrap().last().unwrap().0, 8);
}
