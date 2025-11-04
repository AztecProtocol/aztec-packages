// TODO: Expose other wrapped functions than debug (info, warn)
// ['silent', 'fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace']

pub global SILENT_LOG_LEVEL: u8 = 0;
pub global FATAL_LOG_LEVEL: u8 = 1;
pub global ERROR_LOG_LEVEL: u8 = 2;
pub global WARN_LOG_LEVEL: u8 = 3;
pub global INFO_LOG_LEVEL: u8 = 4;
pub global VERBOSE_LOG_LEVEL: u8 = 5;
pub global DEBUG_LOG_LEVEL: u8 = 6;
pub global TRACE_LOG_LEVEL: u8 = 7;

/// Utility function to console.log data in the acir simulator.
/// Example:
///   debug_log("blah blah this is a debug string");
pub fn debug_log<let N: u32>(msg: str<N>) {
    debug_log_format(msg, []);
}

/// Same as debug_log, but allows to customize the log level.
/// Consider changing just to 'log'
pub fn debug_log_with_level<let N: u32>(log_level: u8, msg: str<N>) {
    debug_log_format_with_level(log_level, msg, []);
}

/// Utility function to console.log data in the acir simulator. This variant receives a format string in which the
/// `${k}` tokens will be replaced with the k-eth value in the `args` array.
/// Examples:
///   debug_log_format("get_2(slot:{0}) =>\n\t0:{1}\n\t1:{2}", [storage_slot, note0_hash, note1_hash]);
///   debug_log_format("whole array: {}", [e1, e2, e3, e4]);
pub fn debug_log_format<let M: u32, let N: u32>(msg: str<M>, args: [Field; N]) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe { debug_log_array_oracle_wrapper(DEBUG_LOG_LEVEL, msg, args) };
}

/// Same as debug_log_format, but allows to customize the log level.
/// Consider changing just to 'log_format'
pub fn debug_log_format_with_level<let M: u32, let N: u32>(
    log_level: u8,
    msg: str<M>,
    args: [Field; N],
) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe { debug_log_array_oracle_wrapper(log_level, msg, args) };
}

/// Utility function to console.log data in the acir simulator. This variant receives a format string in which the
/// `${k}` tokens will be replaced with the k-eth value in the `args` slice.
/// Examples:
///   debug_log_format("get_2(slot:{0}) =>\n\t0:{1}\n\t1:{2}", [storage_slot, note0_hash, note1_hash]);
///   debug_log_format("whole slice: {}", [e1, e2, e3, e4]);
pub fn debug_log_format_slice<let M: u32>(log_level: u8, msg: str<M>, args: [Field]) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe { debug_log_slice_oracle_wrapper(log_level, msg, args) };
}

// We provide two versions of the debug log oracle: one that takes args as a slice and another one that takes args as an array.
// We do this since conversion from array to slice generates overhead in public functions, since opcodes need to be emitted for the conversion.
// By exposing the two flavors, we avoid conversions since the AVM is able to handle both arrays an slices in this oracle.

unconstrained fn debug_log_slice_oracle_wrapper<let M: u32>(
    log_level: u8,
    msg: str<M>,
    args: [Field],
) {
    debug_log_slice_oracle(log_level, msg, args);
}

// WARNING: sometimes when using debug logs the ACVM errors with: `thrown: "solver opcode resolution error: cannot solve opcode: expression has too many unknowns x155"`
#[oracle(utilityDebugLog)]
unconstrained fn debug_log_slice_oracle<let M: u32>(log_level: u8, msg: str<M>, args: [Field]) {}

unconstrained fn debug_log_array_oracle_wrapper<let M: u32, let N: u32>(
    log_level: u8,
    msg: str<M>,
    args: [Field; N],
) {
    debug_log_array_oracle(log_level, msg, N, args);
}

#[oracle(utilityDebugLog)]
unconstrained fn debug_log_array_oracle<let M: u32, let N: u32>(
    log_level: u8,
    msg: str<M>,
    length: u32,
    args: [Field; N],
) {}
