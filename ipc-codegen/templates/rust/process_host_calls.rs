//! Host calls for a service run as a server process: each target name reaches another service over
//! its .sock/.shm path, as `--host-call name=path` names it.
//!
//! In-process, the host that loaded a service answers its host calls (ipc-runtime binds each target
//! to another instance, or to JavaScript). A server process is its own host, so it connects to each
//! target itself. Each calling thread has its own connection to a target, made on its first call,
//! and remade after a call on it fails. Needs the `ipc-runtime` crate.

use super::host_call_backend::set_native_host_call;
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::OnceLock;
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
    static CONNECTIONS: RefCell<HashMap<String, ipc_runtime::IpcClient>> =
        RefCell::new(HashMap::new());
}

/// The target may still be starting when the first call is made, so connecting is retried for a
/// minute.
fn connect(path: &str) -> Result<ipc_runtime::IpcClient, String> {
    const ATTEMPTS: u32 = 600;
    let mut attempt = 1;
    loop {
        match ipc_runtime::IpcClient::from_path(path) {
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
