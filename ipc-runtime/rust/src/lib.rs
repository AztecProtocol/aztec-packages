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

    pub type ipc_server_handler_fn = unsafe extern "C" fn(
        client_id: c_int,
        req: *const u8,
        req_len: usize,
        resp_out: *mut *mut u8,
        resp_len_out: *mut usize,
        ctx: *mut c_void,
    );

    extern "C" {
        pub fn ipc_server_options_default(opts: *mut ipc_server_options_t);

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

        pub fn ipc_make_client(path: *const c_char, shm_client_id: usize) -> *mut ipc_client;
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

    /// Run the event loop. The handler is called for each incoming request
    /// with the client id and request bytes; it returns the response bytes.
    /// Blocks until shutdown is requested.
    pub fn run<F>(&mut self, mut handler: F)
    where
        F: FnMut(i32, &[u8]) -> Vec<u8>,
    {
        // We pass a fat closure as `*mut c_void`. The shim re-casts it back
        // and invokes the closure. The handler's response buffer is owned
        // here; we leak it across the FFI boundary to the runtime which
        // copies it into its send path; we then reclaim and drop it on the
        // next call via thread-local storage. To keep this simple we leak
        // each response and let the runtime copy — small allocations, short
        // lifetimes; the runtime never retains the pointer past send().
        //
        // The cleaner approach is a thread-local Vec<u8> the handler
        // populates; if that becomes important we can add it later.

        struct Ctx<'a> {
            handler: &'a mut dyn FnMut(i32, &[u8]) -> Vec<u8>,
            scratch: Vec<u8>,
        }

        let mut handler_obj: &mut dyn FnMut(i32, &[u8]) -> Vec<u8> = &mut handler;
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
            let response = (ctx.handler)(client_id, req_slice);
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

impl IpcClient {
    /// Construct a client and connect. ".sock" → UDS, ".shm" → MPSC-SHM
    /// (with `shm_client_id` slot).
    pub fn from_path(path: &str) -> Result<Self> {
        Self::from_path_with_id(path, 0)
    }

    pub fn from_path_with_id(path: &str, shm_client_id: usize) -> Result<Self> {
        let c_path = CString::new(path).map_err(|_| Error::InvalidPath(path.to_string()))?;
        let raw = unsafe { sys::ipc_make_client(c_path.as_ptr(), shm_client_id) };
        let inner = NonNull::new(raw).ok_or_else(|| Error::InvalidPath(path.to_string()))?;
        let mut client = IpcClient { inner };
        if !unsafe { sys::ipc_client_connect(client.inner.as_ptr()) } {
            return Err(Error::Connect(path.to_string()));
        }
        Ok(client)
    }

    /// Synchronous request/response. Sends `req`, blocks until a reply
    /// arrives, copies it out, releases the runtime's buffer.
    pub fn call(&mut self, req: &[u8]) -> Result<Vec<u8>> {
        if !unsafe { sys::ipc_client_send(self.inner.as_ptr(), req.as_ptr(), req.len(), 0) } {
            return Err(Error::Send);
        }
        let mut out: *const u8 = std::ptr::null();
        let mut out_len: usize = 0;
        let status =
            unsafe { sys::ipc_client_receive(self.inner.as_ptr(), 0, &mut out, &mut out_len) };
        if status != sys::IPC_OK || out.is_null() {
            return Err(Error::Receive);
        }
        let response = unsafe { std::slice::from_raw_parts(out, out_len) }.to_vec();
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
