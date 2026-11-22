//! Keeps a handler's mistakes inside the service. A request is answered exactly once even when its
//! handler panics or drops its responder unanswered: the caller gets an error response saying so,
//! the panic never unwinds out through an FFI entry point (where it would abort the host process),
//! and the instance keeps serving.

use crate::async_host::RawRespond;
use std::any::Any;
use std::cell::RefCell;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Once;

thread_local! {
    /// The message of the panic this thread is unwinding from, set by the hook before unwinding.
    static PANIC: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// Chains a panic hook that records each panic's message for the thread it happens on, so a
/// responder dropped while unwinding can say why. The previous hook still runs.
fn record_panics() {
    static HOOK: Once = Once::new();
    HOOK.call_once(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            let location = info
                .location()
                .map(|l| format!(" at {}:{}", l.file(), l.line()));
            let message = format!(
                "{}{}",
                payload_message(info.payload()),
                location.unwrap_or_default()
            );
            PANIC.with(|panic| *panic.borrow_mut() = Some(message));
            previous(info);
        }));
    });
}

fn payload_message(payload: &dyn Any) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        (*message).to_string()
    } else if let Some(message) = payload.downcast_ref::<String>() {
        message.clone()
    } else {
        "a panic with no message".to_string()
    }
}

/// Runs `f`, returning `None` if it panicked rather than unwinding into the caller: what every
/// entry point into a service from its host runs its work under. A responder the panic left
/// unanswered has answered with it by the time this returns.
pub fn catch<R>(f: impl FnOnce() -> R) -> Option<R> {
    record_panics();
    forget_panic();
    let result = catch_unwind(AssertUnwindSafe(f)).ok();
    forget_panic();
    result
}

/// Runs `f` like [`catch`], but leaves the panic's message for the responders the caller drops
/// afterwards (a task's, once its poll panicked); the caller then calls [`forget_panic`].
pub(crate) fn catch_keeping_message<R>(f: impl FnOnce() -> R) -> Option<R> {
    record_panics();
    catch_unwind(AssertUnwindSafe(f)).ok()
}

/// Clears the message of a panic every responder it concerned has answered with.
pub(crate) fn forget_panic() {
    PANIC.with(|panic| panic.borrow_mut().take());
}

/// Wraps `raw` so that it answers exactly once: if it is dropped without being called (a handler
/// that panicked, or forgot to answer), it sends `error_frame` of a message saying which.
pub fn answer_once(raw: RawRespond, error_frame: fn(String) -> Vec<u8>) -> RawRespond {
    record_panics();
    struct Unanswered {
        raw: Option<RawRespond>,
        error_frame: fn(String) -> Vec<u8>,
    }
    impl Drop for Unanswered {
        fn drop(&mut self) {
            let Some(raw) = self.raw.take() else { return };
            let panic = PANIC.with(|panic| panic.borrow_mut().take());
            let message = match panic {
                Some(message) => format!("the handler panicked: {message}"),
                None if std::thread::panicking() => "the handler panicked".to_string(),
                None => "the handler dropped its responder without answering".to_string(),
            };
            let frame = (self.error_frame)(message);
            // Already unwinding, or in a destructor: a host callback that panics too must not abort.
            let _ = catch_unwind(AssertUnwindSafe(move || raw(frame)));
        }
    }
    let mut unanswered = Unanswered {
        raw: Some(raw),
        error_frame,
    };
    Box::new(move |response| {
        if let Some(raw) = unanswered.raw.take() {
            raw(response);
        }
    })
}
