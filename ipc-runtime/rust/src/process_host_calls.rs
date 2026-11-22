//! Host calls for a service run as a server process: each target name reaches another service over
//! its .sock/.shm path, as `--host-call name=path` names it.
//!
//! In-process, the host that loaded a service answers its host calls (ipc-runtime binds each target
//! to another instance, or to JavaScript). A server process is its own host, so it connects to each
//! target itself. Each calling thread has its own connection to a target, made on its first call,
//! and remade after a call on it fails.
//!
//! [`serve_async`] serves an [`AsyncInstance`] instead, for handlers that await their host calls:
//! the server keeps taking requests while calls are out, so a target that calls back into this
//! server (directly or through other services) is answered rather than deadlocking it, all on the
//! server's one thread.

use crate::async_host::{ffi_host, AsyncInstance, RawRespond};
use crate::host_call_backend::set_native_host_call;
use std::any::Any;
use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

/// Reads a `--host-call` value: `name=path`.
pub fn parse_host_call(spec: &str) -> Result<(String, String), String> {
    match spec.split_once('=') {
        Some((name, path)) if !name.is_empty() && !path.is_empty() => {
            Ok((name.to_string(), path.to_string()))
        }
        _ => Err(format!("--host-call expects name=path, got: {spec}")),
    }
}

/// Every `--host-call name=path` in a command line's arguments.
pub fn host_call_args(args: &[String]) -> Result<Vec<(String, String)>, String> {
    let mut targets = Vec::new();
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if arg == "--host-call" {
            let spec = iter
                .next()
                .ok_or_else(|| "--host-call expects name=path".to_string())?;
            targets.push(parse_host_call(spec)?);
        }
    }
    Ok(targets)
}

static PATHS: OnceLock<HashMap<String, String>> = OnceLock::new();

thread_local! {
    static CONNECTIONS: RefCell<HashMap<String, crate::IpcClient>> =
        RefCell::new(HashMap::new());
}

/// The target may still be starting when the first call is made, so connecting is retried for a
/// minute.
fn connect(path: &str) -> Result<crate::IpcClient, String> {
    const ATTEMPTS: u32 = 600;
    let mut attempt = 1;
    loop {
        match crate::IpcClient::from_path(path) {
            Ok(client) => return Ok(client),
            Err(e) if attempt == ATTEMPTS => return Err(e.to_string()),
            Err(_) => {
                attempt += 1;
                std::thread::sleep(Duration::from_millis(100));
            }
        }
    }
}

fn call(name: &str, request: &[u8]) -> Result<Vec<u8>, String> {
    let Some(path) = PATHS.get().and_then(|paths| paths.get(name)) else {
        return Err(format!(
            "no host-call target \"{name}\" (start the server with --host-call {name}=<path>)"
        ));
    };
    CONNECTIONS.with(|connections| {
        let mut connections = connections.borrow_mut();
        if !connections.contains_key(name) {
            let client = connect(path).map_err(|e| format!("{path}: {e}"))?;
            connections.insert(name.to_string(), client);
        }
        let result = connections.get_mut(name).unwrap().call(request);
        result.map_err(|e| {
            connections.remove(name);
            format!("{path}: {e}")
        })
    })
}

/// Answers with a malloc'd buffer the caller frees, as the host-call contract requires.
unsafe fn answer(
    status: i32,
    bytes: &[u8],
    response: *mut *mut u8,
    response_len: *mut usize,
) -> i32 {
    unsafe extern "C" {
        fn malloc(size: usize) -> *mut std::ffi::c_void;
    }
    // SAFETY: a fresh buffer of at least one byte, filled within its length.
    unsafe {
        let out = malloc(bytes.len().max(1)) as *mut u8;
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), out, bytes.len());
        *response = out;
        *response_len = bytes.len();
    }
    status
}

unsafe extern "C" fn route_host_call(
    target: *const u8,
    target_len: usize,
    request: *const u8,
    request_len: usize,
    response: *mut *mut u8,
    response_len: *mut usize,
) -> i32 {
    // SAFETY: the caller passes the target and request within their lengths.
    let (name, request) = unsafe {
        (
            String::from_utf8_lossy(std::slice::from_raw_parts(target, target_len)),
            std::slice::from_raw_parts(request, request_len),
        )
    };
    // SAFETY: the out-pointers are the caller's.
    unsafe {
        match call(&name, request) {
            Ok(bytes) => answer(0, &bytes, response, response_len),
            Err(message) => answer(1, message.as_bytes(), response, response_len),
        }
    }
}

/// Sends this process's host calls to the services at the given paths. Call once, before serving.
pub fn route_host_calls(targets: Vec<(String, String)>) {
    let _ = PATHS.set(targets.into_iter().collect());
    set_native_host_call(Some(route_host_call));
}

thread_local! {
    /// The handler serve_async hands to `create`, which the runtime calls on the same thread.
    static PENDING: RefCell<Option<Box<dyn Any>>> = const { RefCell::new(None) };
}

type Dispatch<H> = fn(&mut H, &[u8], RawRespond);

unsafe extern "C" fn create<H: 'static>(
    host_ctx: *mut c_void,
    respond: ffi_host::RespondFn,
    call: ffi_host::CallFn,
) -> *mut c_void {
    let Some(pending) = PENDING.with(|p| p.borrow_mut().take()) else {
        return std::ptr::null_mut();
    };
    let Ok(pending) = pending.downcast::<(H, Dispatch<H>)>() else {
        return std::ptr::null_mut();
    };
    let (handler, dispatch) = *pending;
    let host = ffi_host::FfiHost {
        ctx: host_ctx,
        respond,
        call,
    };
    Box::into_raw(Box::new(AsyncInstance::new(
        handler,
        Arc::new(host),
        dispatch,
    ))) as *mut c_void
}

/// # Safety
/// `bytes` points to `len` readable bytes (or `len` is 0).
unsafe fn borrowed<'a>(bytes: *const u8, len: usize) -> &'a [u8] {
    if len == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(bytes, len) }
    }
}

unsafe extern "C" fn submit<H: 'static>(
    instance: *mut c_void,
    id: u64,
    input: *const u8,
    len: usize,
) {
    // SAFETY: instance came from create::<H>; the runtime makes one call into it at a time.
    let instance = unsafe { &mut *(instance as *mut AsyncInstance<H>) };
    instance.submit(id, unsafe { borrowed(input, len) });
}

unsafe extern "C" fn deliver<H: 'static>(
    instance: *mut c_void,
    call_id: u64,
    status: i32,
    response: *const u8,
    len: usize,
) {
    // SAFETY: as for submit.
    let instance = unsafe { &mut *(instance as *mut AsyncInstance<H>) };
    instance.deliver(call_id, status, unsafe { borrowed(response, len) });
}

unsafe extern "C" fn destroy<H: 'static>(instance: *mut c_void) {
    // SAFETY: instance came from create::<H> and is destroyed once.
    drop(unsafe { Box::from_raw(instance as *mut AsyncInstance<H>) });
}

/// Serves `handler` as an [`AsyncInstance`] until shutdown, through ipc-runtime's re-entrant loop
/// ([`IpcServer::serve_async`](crate::IpcServer::serve_async)): everything runs on this thread,
/// requests are taken while host calls are out, and each host call goes to its target in `targets`
/// (name, socket path) over one connection per target. `dispatch` is the generated
/// `<service>_server::submit_request`. Shared memory is not re-entrant, so a `.shm` server or
/// target is refused.
pub fn serve_async<H: 'static>(
    server: &mut crate::IpcServer,
    handler: H,
    dispatch: Dispatch<H>,
    targets: Vec<(String, String)>,
) -> Result<(), String> {
    PENDING.with(|p| *p.borrow_mut() = Some(Box::new((handler, dispatch))));
    let service = crate::AsyncService {
        create: create::<H>,
        submit: submit::<H>,
        deliver: deliver::<H>,
        destroy: destroy::<H>,
    };
    let result = server.serve_async(&service, &targets);
    PENDING.with(|p| p.borrow_mut().take());
    result
}
