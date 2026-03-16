// Not all log levels are currently used, but we provide the full set so that new call sites can use any level. Because
// of that we tag all with `#[allow(dead_code)]` to prevent warnings.

use std::meta::ctstring::AsCtString;

comptime fn log_prefix<let N: u32>(msg: str<N>) -> CtString {
    "[aztec-nr] ".as_ctstring().append_str(msg)
}

// --- No-args variants (direct call) ---

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_fatal_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { crate::protocol::logging::fatal_log($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_error_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { crate::protocol::logging::error_log($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_warn_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { crate::protocol::logging::warn_log($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_info_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { crate::protocol::logging::info_log($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_verbose_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { crate::protocol::logging::verbose_log($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_debug_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { crate::protocol::logging::debug_log($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_trace_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { crate::protocol::logging::trace_log($msg) }
}

// --- Format variants (return lambda for runtime args) ---

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_fatal_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { (|args| crate::protocol::logging::fatal_log_format($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_error_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { (|args| crate::protocol::logging::error_log_format($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_warn_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { (|args| crate::protocol::logging::warn_log_format($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_info_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { (|args| crate::protocol::logging::info_log_format($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_verbose_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { (|args| crate::protocol::logging::verbose_log_format($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_debug_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { (|args| crate::protocol::logging::debug_log_format($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_trace_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    quote { (|args| crate::protocol::logging::trace_log_format($msg, args)) }
}
