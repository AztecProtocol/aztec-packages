//! Host calls for a service run as a server process: each target name reaches another service over
//! its .sock/.shm path, as `--host-call name=path` names it.
//!
//! In-process, the host that loaded a service answers its host calls (ipc-runtime binds each target
//! to another instance, or to JavaScript). A server process is its own host, so it connects to each
//! target itself. Each calling thread has its own connection to a target, made on its first call,
//! and remade after a call on it fails. Needs the `ipc-runtime` crate.
//!
//! [`serve_async`] serves an [`AsyncInstance`] instead, for handlers that await their host calls:
//! the server keeps taking requests while calls are out, so a target that calls back into this
//! server (directly or through other services) is answered rather than deadlocking it.

use super::async_host::{AsyncHost, AsyncInstance, RawRespond};
use super::host_call_backend::set_native_host_call;
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
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

enum Job {
    Submit(u64, Vec<u8>, ipc_runtime::Respond),
    Deliver(u64, i32, Vec<u8>),
}

/// The server process as an asynchronous instance's host: responses go to the requests' clients,
/// and each call out is made on a thread of its own, over a connection to its target that no other
/// call is using, its answer queued back to the instance.
struct ProcessHost {
    paths: HashMap<String, String>,
    responders: Mutex<HashMap<u64, ipc_runtime::Respond>>,
    idle: Mutex<HashMap<String, Vec<ipc_runtime::IpcClient>>>,
    jobs: Mutex<mpsc::Sender<Job>>,
}

impl ProcessHost {
    fn call_target(&self, target: &str, request: &[u8]) -> Result<Vec<u8>, String> {
        let Some(path) = self.paths.get(target) else {
            return Err(format!(
                "no host-call target \"{target}\" (start the server with --host-call {target}=<path>)"
            ));
        };
        let idle = self.idle.lock().unwrap().get_mut(target).and_then(Vec::pop);
        let mut client = match idle {
            Some(client) => client,
            None => connect(path).map_err(|e| format!("{path}: {e}"))?,
        };
        let answer = client.call(request).map_err(|e| format!("{path}: {e}"))?;
        self.idle
            .lock()
            .unwrap()
            .entry(target.to_string())
            .or_default()
            .push(client);
        Ok(answer)
    }
}

impl AsyncHost for Arc<ProcessHost> {
    fn respond(&self, request_id: u64, response: &[u8]) {
        if let Some(respond) = self.responders.lock().unwrap().remove(&request_id) {
            respond.send(response);
        }
    }

    fn call(&self, call_id: u64, target: &str, request: &[u8]) {
        let host = self.clone();
        let (target, request) = (target.to_string(), request.to_vec());
        std::thread::spawn(move || {
            let job = match host.call_target(&target, &request) {
                Ok(answer) => Job::Deliver(call_id, 0, answer),
                Err(message) => Job::Deliver(call_id, 1, message.into_bytes()),
            };
            let _ = host.jobs.lock().unwrap().send(job);
        });
    }
}

/// Serves `handler` as an [`AsyncInstance`] until shutdown, its host calls going to the services at
/// `targets`' paths. `dispatch` is the generated `<service>_server::submit_request`. The instance
/// runs on a thread of its own; the server's loop only queues requests to it.
pub fn serve_async<H: Send + 'static>(
    server: &mut ipc_runtime::IpcServer,
    handler: H,
    dispatch: fn(&mut H, &[u8], RawRespond),
    targets: Vec<(String, String)>,
) {
    let (jobs, queue) = mpsc::channel::<Job>();
    let host = Arc::new(ProcessHost {
        paths: targets.into_iter().collect(),
        responders: Mutex::new(HashMap::new()),
        idle: Mutex::new(HashMap::new()),
        jobs: Mutex::new(jobs.clone()),
    });
    let driver_host = host.clone();
    let driver = std::thread::spawn(move || {
        let mut instance = AsyncInstance::new(handler, Arc::new(driver_host.clone()), dispatch);
        for job in queue {
            match job {
                Job::Submit(request_id, request, respond) => {
                    driver_host
                        .responders
                        .lock()
                        .unwrap()
                        .insert(request_id, respond);
                    instance.submit(request_id, &request);
                }
                Job::Deliver(call_id, status, answer) => instance.deliver(call_id, status, &answer),
            }
        }
    });
    let mut next_request = 0u64;
    server.run_reactor(|_client_id, request, respond| {
        next_request += 1;
        let _ = jobs.send(Job::Submit(next_request, request.to_vec(), respond));
    });
    // The loop has answered every request; the calls still out (none, then) end with their threads.
    drop(jobs);
    *host.jobs.lock().unwrap() = mpsc::channel().0;
    let _ = driver.join();
}
