//! The asynchronous FFI exports, driven by a host written here: a Relay calls out to the host's
//! "peer", the host binds "peer" to the same instance, so each hop is another request submitted to
//! the instance while the hops before it wait for their answers. Then the same Relay over the
//! blocking FFI, where each hop's host call blocks on a fresh instance.
#![cfg(feature = "ffi")]

use echo_wire_compat::generated::echo_types::*;
use std::collections::{HashMap, VecDeque};
use std::ffi::c_void;
use std::sync::Mutex;

type RespondFn = unsafe extern "C" fn(*mut c_void, u64, *const u8, usize);
type CallFn = unsafe extern "C" fn(*mut c_void, u64, *const u8, usize, *const u8, usize);

extern "C" {
    fn echo_ipc_ffi_create_async(
        host_ctx: *mut c_void,
        respond: RespondFn,
        call: CallFn,
    ) -> *mut c_void;
    fn echo_ipc_ffi_submit(
        instance: *mut c_void,
        request_id: u64,
        input: *const u8,
        input_len: usize,
    );
    fn echo_ipc_ffi_deliver(
        instance: *mut c_void,
        call_id: u64,
        status: i32,
        response: *const u8,
        len: usize,
    );
    fn echo_ipc_ffi_destroy_async(instance: *mut c_void);
}

enum Event {
    Respond(u64, Vec<u8>),
    Call(u64, String, Vec<u8>),
}

/// The host's queue: the callbacks only record, so nothing calls into the instance from inside them.
#[derive(Default)]
struct Queue(Mutex<VecDeque<Event>>);

unsafe extern "C" fn respond(ctx: *mut c_void, request_id: u64, response: *const u8, len: usize) {
    let queue = unsafe { &*(ctx as *const Queue) };
    let bytes = unsafe { std::slice::from_raw_parts(response, len) }.to_vec();
    queue
        .0
        .lock()
        .unwrap()
        .push_back(Event::Respond(request_id, bytes));
}

unsafe extern "C" fn call(
    ctx: *mut c_void,
    call_id: u64,
    target: *const u8,
    target_len: usize,
    request: *const u8,
    request_len: usize,
) {
    let queue = unsafe { &*(ctx as *const Queue) };
    let target =
        String::from_utf8(unsafe { std::slice::from_raw_parts(target, target_len) }.to_vec())
            .unwrap();
    let bytes = unsafe { std::slice::from_raw_parts(request, request_len) }.to_vec();
    queue
        .0
        .lock()
        .unwrap()
        .push_back(Event::Call(call_id, target, bytes));
}

fn relay_request(data: &[u8], hops: u32) -> Vec<u8> {
    rmp_serde::to_vec_named(&vec![Command::EchoRelay(EchoRelay::new(
        data.to_vec(),
        hops,
    ))])
    .unwrap()
}

fn relay_answer(response: &[u8]) -> Result<Vec<u8>, String> {
    match rmp_serde::from_slice::<Response>(response).unwrap() {
        Response::EchoRelayResponse(r) => Ok(r.data),
        Response::EchoErrorResponse(e) => Err(e.message),
        _ => panic!("not a Relay response"),
    }
}

/// Runs one Relay on an asynchronous instance, routing "peer" back into it (or failing calls to any
/// other target); returns the answer and the most calls that were waiting at once.
fn run_relay(hops: u32, peer: &str) -> (Result<Vec<u8>, String>, usize) {
    let queue = Box::new(Queue::default());
    let ctx = &*queue as *const Queue as *mut c_void;
    let instance = unsafe { echo_ipc_ffi_create_async(ctx, respond, call) };
    let submit = |id: u64, bytes: &[u8]| unsafe {
        echo_ipc_ffi_submit(instance, id, bytes.as_ptr(), bytes.len())
    };
    let deliver = |id: u64, status: i32, bytes: &[u8]| unsafe {
        echo_ipc_ffi_deliver(instance, id, status, bytes.as_ptr(), bytes.len())
    };

    // The peer requests this host submitted, by request id: the call each one answers.
    let mut answers_call: HashMap<u64, u64> = HashMap::new();
    let mut next_id = 1;
    let mut most_waiting = 0;
    submit(0, &relay_request(&[9], hops));
    let answer = loop {
        let event = queue
            .0
            .lock()
            .unwrap()
            .pop_front()
            .expect("the instance went quiet");
        match event {
            Event::Respond(0, response) => break relay_answer(&response),
            Event::Respond(id, response) => {
                let call_id = answers_call
                    .remove(&id)
                    .expect("a response to a peer request");
                deliver(call_id, 0, &response);
            }
            Event::Call(call_id, target, request) if target == peer => {
                answers_call.insert(next_id, call_id);
                most_waiting = most_waiting.max(answers_call.len());
                submit(next_id, &request);
                next_id += 1;
            }
            Event::Call(call_id, target, _) => {
                deliver(call_id, 1, format!("no target {target}").as_bytes())
            }
        }
    };
    unsafe { echo_ipc_ffi_destroy_async(instance) };
    assert!(queue.0.lock().unwrap().is_empty());
    (answer, most_waiting)
}

#[test]
fn relays_nest_on_one_asynchronous_instance() {
    let (answer, most_waiting) = run_relay(5, "peer");
    assert_eq!(answer, Ok(vec![9, 5, 4, 3, 2, 1]));
    assert_eq!(
        most_waiting, 5,
        "every hop waits on the next, on the one instance"
    );

    assert_eq!(run_relay(0, "peer"), (Ok(vec![9]), 0));
}

#[test]
fn a_call_the_host_cannot_route_fails_the_relay_with_the_hosts_message() {
    let (answer, _) = run_relay(2, "nobody");
    assert_eq!(
        answer,
        Err("Backend error: host_call peer: no target peer".to_string())
    );
}

mod blocking {
    use super::*;
    use echo_wire_compat::generated::echo_client::EchoApi;
    use echo_wire_compat::generated::ffi_backend::FfiBackend;
    use echo_wire_compat::generated::host_call_backend::set_native_host_call;

    extern "C" {
        fn echo_ipc_ffi_create() -> *mut c_void;
        fn echo_ipc_ffi_call(
            instance: *mut c_void,
            input: *const u8,
            len: usize,
            out: *mut *mut u8,
            out_len: *mut usize,
        );
        fn echo_ipc_ffi_destroy(instance: *mut c_void);
    }

    /// Answers "peer" with a fresh blocking instance of the service.
    unsafe extern "C" fn host_call(
        _target: *const u8,
        _target_len: usize,
        request: *const u8,
        request_len: usize,
        response: *mut *mut u8,
        response_len: *mut usize,
    ) -> i32 {
        unsafe {
            let instance = echo_ipc_ffi_create();
            echo_ipc_ffi_call(instance, request, request_len, response, response_len);
            echo_ipc_ffi_destroy(instance);
        }
        0
    }

    #[test]
    fn over_the_blocking_ffi_each_hop_blocks_on_its_host_call() {
        set_native_host_call(Some(host_call));
        let mut api = EchoApi::new(FfiBackend::new().unwrap());
        assert_eq!(api.relay(&[9], 3).unwrap().data, vec![9, 3, 2, 1]);
        set_native_host_call(None);
    }
}
