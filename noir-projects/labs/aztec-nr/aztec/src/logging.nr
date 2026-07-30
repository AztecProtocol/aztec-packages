// Not all log levels are currently used, but we provide the full set so that new call sites can use any level. Because
// of that we tag all with `#[allow(dead_code)]` to prevent warnings.
//
// All wrappers resolve function paths at comptime via `resolve_fn` so that the emitted `Quoted` code works both inside
// aztec-nr (where `crate::` = aztec) and inside macro-generated contract code (where `crate::` = the contract).

use std::meta::ctstring::AsCtString;

comptime fn log_prefix<let N: u32>(msg: str<N>) -> CtString {
    "[aztec-nr] ".as_ctstring().append_str(msg)
}

// --- No-args variants (direct call) ---

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_fatal_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::fatal_log });
    quote { $f($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_error_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::error_log });
    quote { $f($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_warn_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::warn_log });
    quote { $f($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_info_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::info_log });
    quote { $f($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_verbose_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::verbose_log });
    quote { $f($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_debug_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::debug_log });
    quote { $f($msg) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_trace_log<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::trace_log });
    quote { $f($msg) }
}

// --- Format variants (return lambda for runtime args) ---

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_fatal_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::fatal_log_format });
    quote { (|args| $f($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_error_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::error_log_format });
    quote { (|args| $f($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_warn_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::warn_log_format });
    quote { (|args| $f($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_info_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::info_log_format });
    quote { (|args| $f($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_verbose_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::verbose_log_format });
    quote { (|args| $f($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_debug_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::debug_log_format });
    quote { (|args| $f($msg, args)) }
}

#[allow(dead_code)]
pub(crate) comptime fn aztecnr_trace_log_format<let N: u32>(msg: str<N>) -> Quoted {
    let msg = log_prefix(msg);
    let f = resolve_fn(quote { crate::protocol::logging::trace_log_format });
    quote { (|args| $f($msg, args)) }
}

// See module-level comment for why this is needed.
comptime fn resolve_fn(path: Quoted) -> TypedExpr {
    path.as_expr().unwrap().resolve(Option::none())
}
