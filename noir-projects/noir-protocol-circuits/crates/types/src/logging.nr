// Log levels matching the JS logger:

// global SILENT_LOG_LEVEL: u8 = 0;
global FATAL_LOG_LEVEL: u8 = 1;
global ERROR_LOG_LEVEL: u8 = 2;
global WARN_LOG_LEVEL: u8 = 3;
global INFO_LOG_LEVEL: u8 = 4;
global VERBOSE_LOG_LEVEL: u8 = 5;
global DEBUG_LOG_LEVEL: u8 = 6;
global TRACE_LOG_LEVEL: u8 = 7;

// --- Per-level log functions (no format args) ---

pub fn fatal_log<let N: u32>(msg: str<N>) {
    fatal_log_format(msg, []);
}

pub fn error_log<let N: u32>(msg: str<N>) {
    error_log_format(msg, []);
}

pub fn warn_log<let N: u32>(msg: str<N>) {
    warn_log_format(msg, []);
}

pub fn info_log<let N: u32>(msg: str<N>) {
    info_log_format(msg, []);
}

pub fn verbose_log<let N: u32>(msg: str<N>) {
    verbose_log_format(msg, []);
}

pub fn debug_log<let N: u32>(msg: str<N>) {
    debug_log_format(msg, []);
}

pub fn trace_log<let N: u32>(msg: str<N>) {
    trace_log_format(msg, []);
}

// --- Per-level log functions (with format args) ---

pub fn fatal_log_format<let M: u32, let N: u32>(msg: str<M>, args: [Field; N]) {
    log_format(FATAL_LOG_LEVEL, msg, args);
}

pub fn error_log_format<let M: u32, let N: u32>(msg: str<M>, args: [Field; N]) {
    log_format(ERROR_LOG_LEVEL, msg, args);
}

pub fn warn_log_format<let M: u32, let N: u32>(msg: str<M>, args: [Field; N]) {
    log_format(WARN_LOG_LEVEL, msg, args);
}

pub fn info_log_format<let M: u32, let N: u32>(msg: str<M>, args: [Field; N]) {
    log_format(INFO_LOG_LEVEL, msg, args);
}

pub fn verbose_log_format<let M: u32, let N: u32>(msg: str<M>, args: [Field; N]) {
    log_format(VERBOSE_LOG_LEVEL, msg, args);
}

pub fn debug_log_format<let M: u32, let N: u32>(msg: str<M>, args: [Field; N]) {
    log_format(DEBUG_LOG_LEVEL, msg, args);
}

pub fn trace_log_format<let M: u32, let N: u32>(msg: str<M>, args: [Field; N]) {
    log_format(TRACE_LOG_LEVEL, msg, args);
}

fn log_format<let M: u32, let N: u32>(log_level: u8, msg: str<M>, args: [Field; N]) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe { log_oracle_wrapper(log_level, msg, args) };
}

unconstrained fn log_oracle_wrapper<let M: u32, let N: u32>(
    log_level: u8,
    msg: str<M>,
    args: [Field; N],
) {
    log_oracle(log_level, msg, N, args);
}

#[oracle(utilityLog)]
unconstrained fn log_oracle<let M: u32, let N: u32>(
    log_level: u8,
    msg: str<M>,
    length: u32,
    args: [Field; N],
) {}
