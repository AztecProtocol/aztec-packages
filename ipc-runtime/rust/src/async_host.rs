//! Asynchronous instances: a service whose handlers call out to another service (a host call)
//! and await the answer, while the instance keeps taking requests.
//!
//! A handler that calls out spawns a future and answers from it:
//!
//! ```ignore
//! fn relay(&mut self, cmd: Relay, respond: Responder<RelayResponse>) {
//!     spawn(async move {
//!         let peer = PeerAsyncApi::new(AsyncHostCall::new("peer"));
//!         match peer.relay(&cmd.data, cmd.hops - 1).await {
//!             Ok(r) => respond.ok(r),
//!             Err(e) => respond.error(e.to_string()),
//!         }
//!     });
//! }
//! ```
//!
//! On an [`AsyncInstance`], an awaited host call hands the host a call (`call_id`, target, request)
//! and suspends the future. The instance returns to its host, which may submit further requests
//! (one that the call itself leads to, nested on the same instance, included). The host's answer
//! comes back through [`AsyncInstance::deliver`], which resumes the future where it left off.
//! Everything runs on the thread that drives the instance, inside `submit` and `deliver`, so a
//! handler needs no locking and no threads.
//!
//! Anywhere else (a blocking FFI call, a server answering one request at a time), there is no
//! instance to suspend to: `spawn` runs the future to completion at once, and each host call is
//! made with [`HostCallBackend`], blocking until its answer.

use crate::backend::{AsyncBackend, Backend};
use crate::error::{IpcError, Result};
use crate::host_call_backend::HostCallBackend;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Wake, Waker};

/// The byte-level response sink a generated dispatch takes (`<service>_server::RawRespond`).
pub type RawRespond = Box<dyn FnOnce(Vec<u8>) + Send>;

/// What an asynchronous instance hands its host. A handler may answer from another thread, so
/// both may be called on any thread; a host must queue them rather than call back into the
/// instance from inside either.
pub trait AsyncHost: Send + Sync {
    /// The response to the request submitted as `request_id`.
    fn respond(&self, request_id: u64, response: &[u8]);
    /// A call out to the service the host binds to `target`; its answer comes back through
    /// [`AsyncInstance::deliver`] with the same `call_id`.
    fn call(&self, call_id: u64, target: &str, request: &[u8]);
}

type Task = Pin<Box<dyn Future<Output = ()>>>;

/// A call out awaiting its answer.
struct CallSlot {
    target: String,
    answer: RefCell<Option<Result<Vec<u8>>>>,
    waker: RefCell<Option<Waker>>,
}

/// Tasks woken since the last run, by id. Wakers may be sent to other threads, so this is shared.
#[derive(Default)]
struct Woken(Mutex<Vec<u64>>);

struct TaskWaker {
    id: u64,
    woken: Arc<Woken>,
}

impl Wake for TaskWaker {
    fn wake(self: Arc<Self>) {
        self.woken.0.lock().unwrap().push(self.id);
    }
}

/// The executor of one instance: its tasks and its calls out.
struct Driver {
    host: Arc<dyn AsyncHost>,
    tasks: RefCell<HashMap<u64, Task>>,
    woken: Arc<Woken>,
    next_task: Cell<u64>,
    calls: RefCell<HashMap<u64, Rc<CallSlot>>>,
    next_call: Cell<u64>,
}

impl Driver {
    fn spawn(&self, task: Task) {
        let id = self.next_task.get();
        self.next_task.set(id + 1);
        self.tasks.borrow_mut().insert(id, task);
        self.woken.0.lock().unwrap().push(id);
    }

    /// Polls every woken task until none is left to run.
    fn run(&self) {
        loop {
            let ids = std::mem::take(&mut *self.woken.0.lock().unwrap());
            if ids.is_empty() {
                return;
            }
            for id in ids {
                // Out of the map while it runs: it may spawn tasks of its own.
                let Some(mut task) = self.tasks.borrow_mut().remove(&id) else {
                    continue;
                };
                let waker = Waker::from(Arc::new(TaskWaker {
                    id,
                    woken: self.woken.clone(),
                }));
                let polled = crate::guard::catch_keeping_message(|| {
                    task.as_mut().poll(&mut Context::from_waker(&waker))
                });
                match polled {
                    Some(Poll::Pending) => {
                        self.tasks.borrow_mut().insert(id, task);
                    }
                    Some(Poll::Ready(())) => {}
                    // A task that panicked is dropped, and its responder answers with the panic.
                    None => {
                        drop(task);
                        crate::guard::forget_panic();
                    }
                }
            }
        }
    }
}

thread_local! {
    /// The instance being driven on this thread, inside its `submit` or `deliver`.
    static CURRENT: RefCell<Option<Rc<Driver>>> = const { RefCell::new(None) };
}

/// Makes `driver` this thread's current instance until dropped.
struct Enter(Option<Rc<Driver>>);

impl Enter {
    fn new(driver: &Rc<Driver>) -> Self {
        Self(CURRENT.with(|current| current.replace(Some(driver.clone()))))
    }
}

impl Drop for Enter {
    fn drop(&mut self) {
        CURRENT.with(|current| *current.borrow_mut() = self.0.take());
    }
}

fn current() -> Option<Rc<Driver>> {
    CURRENT.with(|current| current.borrow().clone())
}

/// Runs `future` on the instance being driven: it starts before the current `submit` or `deliver`
/// returns, and is resumed by the answers to its host calls. With no instance being driven, it runs
/// to completion now, its host calls blocking.
pub fn spawn(future: impl Future<Output = ()> + 'static) {
    match current() {
        Some(driver) => driver.spawn(Box::pin(future)),
        None => {
            let mut future = std::pin::pin!(future);
            let waker = Waker::noop();
            // Every host call answers on its first poll here, so the future completes in one.
            let _ = future.as_mut().poll(&mut Context::from_waker(waker));
        }
    }
}

/// A host call that suspends its caller rather than blocking: a backend for a generated
/// `<Service>AsyncApi`, reaching whatever the host binds to `target`.
pub struct AsyncHostCall {
    target: String,
}

impl AsyncHostCall {
    /// `target` is the name the host binds the service to.
    pub fn new(target: impl Into<String>) -> Self {
        Self {
            target: target.into(),
        }
    }
}

impl AsyncBackend for AsyncHostCall {
    fn call(&self, input: Vec<u8>) -> impl Future<Output = Result<Vec<u8>>> {
        HostCallFuture {
            target: self.target.clone(),
            state: CallState::Start(input),
        }
    }
}

enum CallState {
    Start(Vec<u8>),
    Waiting(Rc<CallSlot>),
    Done,
}

struct HostCallFuture {
    target: String,
    state: CallState,
}

impl Future for HostCallFuture {
    type Output = Result<Vec<u8>>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = &mut *self;
        match std::mem::replace(&mut this.state, CallState::Done) {
            CallState::Start(input) => {
                let Some(driver) = current() else {
                    return Poll::Ready(HostCallBackend::new(this.target.clone()).call(&input));
                };
                let call_id = driver.next_call.get();
                driver.next_call.set(call_id + 1);
                let slot = Rc::new(CallSlot {
                    target: this.target.clone(),
                    answer: RefCell::new(None),
                    waker: RefCell::new(Some(cx.waker().clone())),
                });
                driver.calls.borrow_mut().insert(call_id, slot.clone());
                this.state = CallState::Waiting(slot);
                driver.host.call(call_id, &this.target, &input);
                Poll::Pending
            }
            CallState::Waiting(slot) => {
                let answer = slot.answer.borrow_mut().take();
                match answer {
                    Some(answer) => Poll::Ready(answer),
                    None => {
                        *slot.waker.borrow_mut() = Some(cx.waker().clone());
                        this.state = CallState::Waiting(slot);
                        Poll::Pending
                    }
                }
            }
            CallState::Done => Poll::Ready(Err(IpcError::Backend(format!(
                "host_call {}: polled after it completed",
                this.target
            )))),
        }
    }
}

/// An instance of a service driven without blocking: requests go in through [`submit`], answers
/// to its host calls through [`deliver`], and its responses and calls out go to its [`AsyncHost`].
/// One thread at a time drives it; the host never calls into it from inside its callbacks.
///
/// [`submit`]: AsyncInstance::submit
/// [`deliver`]: AsyncInstance::deliver
pub struct AsyncInstance<H> {
    handler: H,
    dispatch: fn(&mut H, &[u8], RawRespond),
    driver: Rc<Driver>,
}

impl<H> AsyncInstance<H> {
    /// `dispatch` is the generated `<service>_server::submit_request` over `handler`.
    pub fn new(
        handler: H,
        host: Arc<dyn AsyncHost>,
        dispatch: fn(&mut H, &[u8], RawRespond),
    ) -> Self {
        Self {
            handler,
            dispatch,
            driver: Rc::new(Driver {
                host,
                tasks: RefCell::new(HashMap::new()),
                woken: Arc::new(Woken::default()),
                next_task: Cell::new(0),
                calls: RefCell::new(HashMap::new()),
                next_call: Cell::new(0),
            }),
        }
    }

    /// Runs a request, answered (now or once its host calls are answered) through the host's
    /// `respond` with `request_id`.
    pub fn submit(&mut self, request_id: u64, request: &[u8]) {
        let _enter = Enter::new(&self.driver);
        let host = self.driver.host.clone();
        let respond: RawRespond = Box::new(move |response| host.respond(request_id, &response));
        // The generated dispatch answers a handler's panic itself; this keeps any other panic from
        // unwinding out through the host's call.
        crate::guard::catch(|| (self.dispatch)(&mut self.handler, request, respond));
        crate::guard::catch(|| self.driver.run());
    }

    /// The host's answer to call `call_id`: 0 and the service's response, or non-zero and the
    /// host's message saying why the call never reached a service.
    pub fn deliver(&mut self, call_id: u64, status: i32, response: &[u8]) {
        let _enter = Enter::new(&self.driver);
        let Some(slot) = self.driver.calls.borrow_mut().remove(&call_id) else {
            return;
        };
        let answer = if status == 0 {
            Ok(response.to_vec())
        } else {
            Err(IpcError::Backend(format!(
                "host_call {}: {}",
                slot.target,
                String::from_utf8_lossy(response)
            )))
        };
        *slot.answer.borrow_mut() = Some(answer);
        if let Some(waker) = slot.waker.borrow_mut().take() {
            waker.wake();
        }
        crate::guard::catch(|| self.driver.run());
    }
}

/// The C callbacks a native host passes to `<service>_ipc_ffi_create_async`.
#[cfg(not(target_arch = "wasm32"))]
pub mod ffi_host {
    use super::AsyncHost;
    use std::ffi::c_void;

    pub type RespondFn = unsafe extern "C" fn(
        host_ctx: *mut c_void,
        request_id: u64,
        response: *const u8,
        response_len: usize,
    );
    pub type CallFn = unsafe extern "C" fn(
        host_ctx: *mut c_void,
        call_id: u64,
        target: *const u8,
        target_len: usize,
        request: *const u8,
        request_len: usize,
    );

    /// A native host: its context and its two callbacks, which take borrowed bytes.
    pub struct FfiHost {
        pub ctx: *mut c_void,
        pub respond: RespondFn,
        pub call: CallFn,
    }

    // SAFETY: the contract has the host's callbacks callable from any thread.
    unsafe impl Send for FfiHost {}
    unsafe impl Sync for FfiHost {}

    impl AsyncHost for FfiHost {
        fn respond(&self, request_id: u64, response: &[u8]) {
            // SAFETY: the host reads the bytes within their length, during the call.
            unsafe { (self.respond)(self.ctx, request_id, response.as_ptr(), response.len()) }
        }
        fn call(&self, call_id: u64, target: &str, request: &[u8]) {
            // SAFETY: as above.
            unsafe {
                (self.call)(
                    self.ctx,
                    call_id,
                    target.as_ptr(),
                    target.len(),
                    request.as_ptr(),
                    request.len(),
                )
            }
        }
    }
}

/// A wasm module's host: the `ipc_runtime.async_respond` and `ipc_runtime.async_call` imports.
#[cfg(target_arch = "wasm32")]
pub mod ffi_host {
    use super::AsyncHost;

    #[link(wasm_import_module = "ipc_runtime")]
    unsafe extern "C" {
        #[link_name = "async_respond"]
        fn async_respond(host_ctx: u32, request_id: u64, response: *const u8, response_len: usize);
        #[link_name = "async_call"]
        fn async_call(
            host_ctx: u32,
            call_id: u64,
            target: *const u8,
            target_len: usize,
            request: *const u8,
            request_len: usize,
        );
    }

    /// The host's handle for this instance, passed to `<service>_ipc_ffi_create_async`.
    pub struct FfiHost {
        pub ctx: u32,
    }

    impl AsyncHost for FfiHost {
        fn respond(&self, request_id: u64, response: &[u8]) {
            // SAFETY: the host copies the bytes out of linear memory during the call.
            unsafe { async_respond(self.ctx, request_id, response.as_ptr(), response.len()) }
        }
        fn call(&self, call_id: u64, target: &str, request: &[u8]) {
            // SAFETY: as above.
            unsafe {
                async_call(
                    self.ctx,
                    call_id,
                    target.as_ptr(),
                    target.len(),
                    request.as_ptr(),
                    request.len(),
                )
            }
        }
    }
}
