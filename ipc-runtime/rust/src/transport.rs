//! Safe Rust bindings to ipc-runtime — UDS + MPSC-SHM transport.
//!
//! Mirrors the C++ API: `IpcServer` and `IpcClient` types pick the right
//! transport based on the input path's suffix (`.sock` → UDS,
//! `.shm` → MPSC-SHM). Use the `from_path` constructors and the rest of
//! the API is the same across transports.
//!
//! See ipc-runtime/cpp/ipc_runtime/c_abi.h for the underlying C ABI.

#![allow(non_camel_case_types)]

use std::ffi::{c_void, CString};
use std::os::fd::RawFd;
use std::os::raw::{c_char, c_int};
use std::ptr::NonNull;

// ---------------------------------------------------------------------------
// extern "C" declarations (mirror of c_abi.h)
// ---------------------------------------------------------------------------

mod sys {
    use super::*;

    #[repr(C)]
    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    pub struct ipc_status_t(pub i32);

    pub const IPC_OK: ipc_status_t = ipc_status_t(0);

    #[repr(C)]
    pub struct ipc_server_options_t {
        pub max_shm_clients: usize,
        pub shm_request_ring_size: usize,
        pub shm_response_ring_size: usize,
        pub socket_backlog: c_int,
    }

    pub enum ipc_server {}
    pub enum ipc_client {}

    #[repr(C)]
    pub struct ipc_host_call_target {
        pub name: *const c_char,
        pub path: *const c_char,
    }

    pub type ipc_server_handler_fn = unsafe extern "C" fn(
        client_id: c_int,
        req: *const u8,
        req_len: usize,
        resp_out: *mut *mut u8,
        resp_len_out: *mut usize,
        ctx: *mut c_void,
    );

    pub type ipc_oversized_response_fn = unsafe extern "C" fn(
        size: usize,
        limit: usize,
        resp_out: *mut *mut u8,
        resp_len_out: *mut usize,
        ctx: *mut c_void,
    );

    extern "C" {

        pub fn ipc_make_server(
            path: *const c_char,
            opts: *const ipc_server_options_t,
        ) -> *mut ipc_server;
        pub fn ipc_server_destroy(server: *mut ipc_server);
        pub fn ipc_server_listen(server: *mut ipc_server) -> bool;
        pub fn ipc_server_close(server: *mut ipc_server);
        pub fn ipc_server_request_shutdown(server: *mut ipc_server);
        pub fn ipc_server_run(
            server: *mut ipc_server,
            handler: ipc_server_handler_fn,
            ctx: *mut c_void,
        );
        pub fn ipc_install_default_signal_handlers(server: *mut ipc_server);
        pub fn ipc_server_set_oversized_response(
            server: *mut ipc_server,
            make: Option<ipc_oversized_response_fn>,
            ctx: *mut c_void,
        );
        pub fn ipc_server_serve_async(
            server: *mut ipc_server,
            service: *const super::AsyncService,
            targets: *const ipc_host_call_target,
            target_count: usize,
        ) -> *mut c_char;
        pub fn free(ptr: *mut c_void);

        pub fn ipc_make_client(path: *const c_char, shm_client_id: usize) -> *mut ipc_client;
        pub fn ipc_client_create_pipe(in_fd: c_int, out_fd: c_int) -> *mut ipc_client;
        pub fn ipc_client_destroy(client: *mut ipc_client);
        pub fn ipc_client_connect(client: *mut ipc_client) -> bool;
        pub fn ipc_client_close(client: *mut ipc_client);
        pub fn ipc_client_send(
            client: *mut ipc_client,
            data: *const u8,
            len: usize,
            timeout_ns: u64,
        ) -> bool;
        pub fn ipc_client_receive(
            client: *mut ipc_client,
            timeout_ns: u64,
            out: *mut *const u8,
            out_len: *mut usize,
        ) -> ipc_status_t;
        pub fn ipc_client_release(client: *mut ipc_client, msg_size: usize);
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum Error {
    InvalidPath(String),
    Connect(String),
    Listen(String),
    Send,
    Receive,
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::InvalidPath(p) => {
                write!(
                    f,
                    "ipc-runtime: invalid path (must end in .sock or .shm): {}",
                    p
                )
            }
            Error::Connect(p) => write!(f, "ipc-runtime: connect failed for {}", p),
            Error::Listen(p) => write!(f, "ipc-runtime: listen failed for {}", p),
            Error::Send => write!(f, "ipc-runtime: send failed"),
            Error::Receive => write!(f, "ipc-runtime: receive failed"),
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

/// 0 = infinite, matching the C ABI's unified timeout semantics. `call`
/// is documented as blocking until the reply arrives.
const DEFAULT_CALL_TIMEOUT_NS: u64 = 0;

// ---------------------------------------------------------------------------
// IpcServer
// ---------------------------------------------------------------------------

/// Server handle. Drop closes + releases the underlying C++ object.
pub struct IpcServer {
    inner: NonNull<sys::ipc_server>,
}

unsafe impl Send for IpcServer {}

impl IpcServer {
    /// Construct a server from a path. ".sock" → UDS, ".shm" → MPSC-SHM.
    pub fn from_path(path: &str) -> Result<Self> {
        let c_path = CString::new(path).map_err(|_| Error::InvalidPath(path.to_string()))?;
        let raw = unsafe { sys::ipc_make_server(c_path.as_ptr(), std::ptr::null()) };
        NonNull::new(raw)
            .map(|inner| IpcServer { inner })
            .ok_or_else(|| Error::InvalidPath(path.to_string()))
    }

    pub fn listen(&mut self) -> Result<()> {
        if unsafe { sys::ipc_server_listen(self.inner.as_ptr()) } {
            Ok(())
        } else {
            Err(Error::Listen("listen() returned false".to_string()))
        }
    }

    pub fn request_shutdown(&self) {
        unsafe { sys::ipc_server_request_shutdown(self.inner.as_ptr()) };
    }

    /// Install default lifecycle signal handlers (SIGTERM/SIGINT graceful
    /// shutdown, SIGBUS/SIGSEGV close+exit, parent-death watch).
    pub fn install_default_signal_handlers(&self) {
        unsafe { sys::ipc_install_default_signal_handlers(self.inner.as_ptr()) };
    }

    /// What [`run`](Self::run) sends in place of a response larger than the transport carries
    /// (half a shared-memory ring), made from its size and the limit: a service passes the
    /// generated `<service>_server::oversized_response`, so the caller gets an error response
    /// rather than the loop ending.
    pub fn set_oversized_response(&mut self, make: fn(usize, usize) -> Vec<u8>) {
        thread_local! {
            static SCRATCH: std::cell::RefCell<Vec<u8>> = const { std::cell::RefCell::new(Vec::new()) };
        }
        unsafe extern "C" fn shim(
            size: usize,
            limit: usize,
            resp_out: *mut *mut u8,
            resp_len_out: *mut usize,
            ctx: *mut c_void,
        ) {
            // SAFETY: ctx is the fn pointer set_oversized_response passed.
            let make: fn(usize, usize) -> Vec<u8> = unsafe { std::mem::transmute(ctx) };
            let response = crate::guard::catch(|| make(size, limit)).unwrap_or_default();
            // The runtime copies the response before the loop's next call.
            SCRATCH.with(|scratch| {
                let mut scratch = scratch.borrow_mut();
                *scratch = response;
                unsafe {
                    *resp_out = scratch.as_mut_ptr();
                    *resp_len_out = scratch.len();
                }
            });
        }
        unsafe {
            sys::ipc_server_set_oversized_response(self.inner.as_ptr(), Some(shim), make as *const () as *mut c_void);
        }
    }

    /// Run the event loop. The handler is called for each incoming request
    /// with the client id and request bytes; it returns the response bytes.
    /// Blocks until shutdown is requested.
    pub fn run<F>(&mut self, mut handler: F)
    where
        F: FnMut(i32, &[u8]) -> Vec<u8>,
    {
        // We pass a fat closure as `*mut c_void`; the shim re-casts it back
        // and invokes the closure. The handler's response lives in
        // `Ctx::scratch`, which stays valid while the runtime copies it into
        // its send path (the runtime never retains the pointer past send())
        // and is dropped/overwritten on the next request.

        struct Ctx<'a> {
            handler: &'a mut dyn FnMut(i32, &[u8]) -> Vec<u8>,
            scratch: Vec<u8>,
        }

        let handler_obj: &mut dyn FnMut(i32, &[u8]) -> Vec<u8> = &mut handler;
        let mut ctx = Ctx {
            handler: handler_obj,
            scratch: Vec::new(),
        };

        unsafe extern "C" fn shim(
            client_id: c_int,
            req: *const u8,
            req_len: usize,
            resp_out: *mut *mut u8,
            resp_len_out: *mut usize,
            ctx_raw: *mut c_void,
        ) {
            let ctx = &mut *(ctx_raw as *mut Ctx<'_>);
            let req_slice = if req_len == 0 {
                &[]
            } else {
                std::slice::from_raw_parts(req, req_len)
            };
            // A panic must not unwind into the C++ loop; the generated handle_request answers its
            // handler's panics itself, so this only catches a handler of the caller's own.
            let response = crate::guard::catch(|| (ctx.handler)(client_id, req_slice)).unwrap_or_default();
            ctx.scratch = response;
            *resp_out = ctx.scratch.as_mut_ptr();
            *resp_len_out = ctx.scratch.len();
        }

        unsafe {
            sys::ipc_server_run(
                self.inner.as_ptr(),
                shim,
                &mut ctx as *mut Ctx<'_> as *mut c_void,
            );
        }
    }
}

/// A service's asynchronous FFI (`<svc>_ipc_ffi_create_async`, `_submit`, `_deliver`,
/// `_destroy_async`), which [`IpcServer::serve_async`] drives. Its callbacks may be called on any
/// thread. Mirrors `ipc_async_service_t` in `ipc-runtime/cpp/ipc_runtime/ffi_abi.h`, which defines
/// the contract.
#[repr(C)]
pub struct AsyncService {
    pub create: unsafe extern "C" fn(
        host_ctx: *mut c_void,
        respond: unsafe extern "C" fn(*mut c_void, u64, *const u8, usize),
        call: unsafe extern "C" fn(*mut c_void, u64, *const u8, usize, *const u8, usize),
    ) -> *mut c_void,
    pub submit:
        unsafe extern "C" fn(instance: *mut c_void, request_id: u64, input: *const u8, len: usize),
    pub deliver: unsafe extern "C" fn(
        instance: *mut c_void,
        call_id: u64,
        status: i32,
        response: *const u8,
        len: usize,
    ),
    pub destroy: unsafe extern "C" fn(instance: *mut c_void),
}

impl IpcServer {
    /// Serves `service` re-entrantly on this thread until shutdown: each request is submitted as
    /// it arrives, its host calls go to `targets` (name, socket path), one connection each, and
    /// their answers are delivered as they come back, all from the server's own event loop. A
    /// server or target on shared memory, which is not re-entrant, is refused.
    pub fn serve_async(
        &mut self,
        service: &AsyncService,
        targets: &[(String, String)],
    ) -> std::result::Result<(), String> {
        let owned: Vec<(CString, CString)> = targets
            .iter()
            .map(|(name, path)| {
                Ok((
                    CString::new(name.as_str())
                        .map_err(|_| format!("host-call target {name:?} contains a NUL"))?,
                    CString::new(path.as_str())
                        .map_err(|_| format!("host-call path {path:?} contains a NUL"))?,
                ))
            })
            .collect::<std::result::Result<_, String>>()?;
        let list: Vec<sys::ipc_host_call_target> = owned
            .iter()
            .map(|(name, path)| sys::ipc_host_call_target {
                name: name.as_ptr(),
                path: path.as_ptr(),
            })
            .collect();
        // SAFETY: the server is listening and owned; `service`'s functions follow the async FFI's
        // contract; `list` and the strings it points to outlive the call.
        let error = unsafe {
            sys::ipc_server_serve_async(self.inner.as_ptr(), service, list.as_ptr(), list.len())
        };
        if error.is_null() {
            return Ok(());
        }
        // SAFETY: a NUL-terminated message the runtime malloc'd for us to free.
        let message = unsafe { std::ffi::CStr::from_ptr(error) }
            .to_string_lossy()
            .into_owned();
        unsafe { sys::free(error as *mut c_void) };
        Err(message)
    }
}

impl Drop for IpcServer {
    fn drop(&mut self) {
        unsafe {
            sys::ipc_server_close(self.inner.as_ptr());
            sys::ipc_server_destroy(self.inner.as_ptr());
        }
    }
}

// ---------------------------------------------------------------------------
// IpcClient
// ---------------------------------------------------------------------------

/// Client handle. Drop closes + releases the underlying C++ object.
pub struct IpcClient {
    inner: NonNull<sys::ipc_client>,
}

unsafe impl Send for IpcClient {}

/// The MPSC-SHM client id that claims a free slot (C++ `ipc::kAutoClientId`).
pub const AUTO_CLIENT_ID: usize = usize::MAX;

impl IpcClient {
    /// Construct a client and connect. ".sock" → UDS, ".shm" → MPSC-SHM, claiming a free client
    /// slot so that any number of clients can share one server.
    pub fn from_path(path: &str) -> Result<Self> {
        Self::from_path_with_id(path, AUTO_CLIENT_ID)
    }

    /// Construct a client over an already-open fd pair, for talking to a child
    /// process over its stdin/stdout. `in_fd` is read from, `out_fd` written
    /// to; both stay owned by the caller and must outlive the client.
    ///
    /// # Safety
    /// The descriptors must be valid and open for the client's lifetime.
    pub unsafe fn from_fds(in_fd: RawFd, out_fd: RawFd) -> Result<Self> {
        let raw = unsafe { sys::ipc_client_create_pipe(in_fd, out_fd) };
        let inner = NonNull::new(raw).ok_or(Error::Connect("pipe".to_string()))?;
        let client = IpcClient { inner };
        if !unsafe { sys::ipc_client_connect(client.inner.as_ptr()) } {
            return Err(Error::Connect("pipe".to_string()));
        }
        Ok(client)
    }

    /// Like [`IpcClient::from_path`], but pins MPSC-SHM slot `shm_client_id` without claiming it,
    /// or claims a free one for [`AUTO_CLIENT_ID`]. Two clients pinned to one slot corrupt each
    /// other's requests. Ignored for UDS.
    pub fn from_path_with_id(path: &str, shm_client_id: usize) -> Result<Self> {
        let c_path = CString::new(path).map_err(|_| Error::InvalidPath(path.to_string()))?;
        let raw = unsafe { sys::ipc_make_client(c_path.as_ptr(), shm_client_id) };
        let inner = NonNull::new(raw).ok_or_else(|| Error::InvalidPath(path.to_string()))?;
        let client = IpcClient { inner };
        if !unsafe { sys::ipc_client_connect(client.inner.as_ptr()) } {
            return Err(Error::Connect(path.to_string()));
        }
        Ok(client)
    }

    /// Synchronous request/response. Sends `req`, blocks until a reply
    /// arrives, copies it out, releases the runtime's buffer. A zero-length
    /// reply is `Ok(vec![])`, not an error.
    pub fn call(&mut self, req: &[u8]) -> Result<Vec<u8>> {
        if !unsafe {
            sys::ipc_client_send(
                self.inner.as_ptr(),
                req.as_ptr(),
                req.len(),
                DEFAULT_CALL_TIMEOUT_NS,
            )
        } {
            return Err(Error::Send);
        }
        let mut out: *const u8 = std::ptr::null();
        let mut out_len: usize = 0;
        let status = unsafe {
            sys::ipc_client_receive(
                self.inner.as_ptr(),
                DEFAULT_CALL_TIMEOUT_NS,
                &mut out,
                &mut out_len,
            )
        };
        if status != sys::IPC_OK {
            return Err(Error::Receive);
        }
        // IPC_OK with out_len == 0 is a valid zero-length response; the
        // release must still run (it consumes the frame header for SHM).
        let response = if out_len == 0 {
            Vec::new()
        } else {
            unsafe { std::slice::from_raw_parts(out, out_len) }.to_vec()
        };
        unsafe { sys::ipc_client_release(self.inner.as_ptr(), out_len) };
        Ok(response)
    }
}

impl Drop for IpcClient {
    fn drop(&mut self) {
        unsafe {
            sys::ipc_client_close(self.inner.as_ptr());
            sys::ipc_client_destroy(self.inner.as_ptr());
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Spawn `server.run(echo)` on a thread and return a raw handle usable to
    /// request shutdown from the test thread (run() holds &mut self, so the
    /// safe `request_shutdown(&self)` cannot be called concurrently).
    fn spawn_echo_server(path: &str) -> (std::thread::JoinHandle<()>, usize) {
        let mut server = IpcServer::from_path(path).expect("make server");
        server.listen().expect("listen");
        let raw = server.inner.as_ptr() as usize;
        let handle = std::thread::spawn(move || {
            server.run(|_client_id, req| {
                if req == b"empty" {
                    Vec::new()
                } else {
                    req.to_vec()
                }
            });
        });
        (handle, raw)
    }

    fn shutdown_server(raw: usize, handle: std::thread::JoinHandle<()>) {
        unsafe { sys::ipc_server_request_shutdown(raw as *mut sys::ipc_server) };
        handle.join().expect("server thread");
    }

    #[test]
    fn connect_refused_is_err_not_hang() {
        let path = format!("/tmp/ipc_rust_test_refused_{}.sock", std::process::id());
        let start = std::time::Instant::now();
        let result = IpcClient::from_path(&path);
        assert!(result.is_err(), "connect to absent server must fail");
        // The connect budget is 5s; anything wildly beyond means a hang.
        assert!(start.elapsed() < std::time::Duration::from_secs(30));
    }

    #[test]
    fn uds_echo_and_zero_length_response() {
        let path = format!("/tmp/ipc_rust_test_uds_{}.sock", std::process::id());
        let _ = std::fs::remove_file(&path);
        let (handle, raw) = spawn_echo_server(&path);

        let mut client = IpcClient::from_path(&path).expect("connect");
        let resp = client.call(b"hello").expect("echo call");
        assert_eq!(resp, b"hello");

        // A handler returning an empty Vec must surface as Ok(empty), not Err.
        let resp = client.call(b"empty").expect("zero-length call");
        assert!(resp.is_empty());

        drop(client);
        shutdown_server(raw, handle);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn shm_echo_and_zero_length_response() {
        let path = format!("/ipc_rust_test_shm_{}.shm", std::process::id());
        let (handle, raw) = spawn_echo_server(&path);

        let mut client = IpcClient::from_path(&path).expect("connect");
        let resp = client.call(b"hello shm").expect("echo call");
        assert_eq!(resp, b"hello shm");

        let resp = client.call(b"empty").expect("zero-length call");
        assert!(resp.is_empty());

        drop(client);
        shutdown_server(raw, handle);
    }

    #[test]
    fn shm_oversized_response_is_replaced_and_the_server_keeps_serving() {
        let path = format!("/ipc_rust_test_big_{}.shm", std::process::id());
        let mut server = IpcServer::from_path(&path).expect("make server");
        server.listen().expect("listen");
        server.set_oversized_response(|size, limit| format!("too big: {size} > {limit}").into_bytes());
        let raw = server.inner.as_ptr() as usize;
        let handle = std::thread::spawn(move || {
            // Larger than half the default ring.
            server.run(|_client_id, req| if req == b"big" { vec![0xAB; 4 << 20] } else { req.to_vec() });
        });

        let mut client = IpcClient::from_path(&path).expect("connect");
        let resp = String::from_utf8(client.call(b"big").expect("an answer")).unwrap();
        assert!(resp.starts_with(&format!("too big: {} > ", 4 << 20)), "{resp}");
        assert_eq!(client.call(b"small").expect("still serving"), b"small");

        drop(client);
        shutdown_server(raw, handle);
    }

    #[test]
    fn shm_clients_from_path_each_claim_their_own_slot() {
        let path = format!("/ipc_rust_test_slots_{}.shm", std::process::id());
        let mut server = IpcServer::from_path(&path).expect("make server");
        server.listen().expect("listen");
        let raw = server.inner.as_ptr() as usize;
        let handle = std::thread::spawn(move || {
            server.run(|_client_id, req| req.to_vec());
        });

        let clients: Vec<_> = (0..2u8)
            .map(|t| {
                let path = path.clone();
                std::thread::spawn(move || {
                    let mut client = IpcClient::from_path(&path).expect("connect");
                    for i in 0..200u32 {
                        let req = [&[t][..], &i.to_le_bytes()[..]].concat();
                        assert_eq!(client.call(&req).expect("an answer"), req);
                    }
                })
            })
            .collect();
        for client in clients {
            client.join().expect("each client gets its own answers");
        }

        shutdown_server(raw, handle);
    }
}
