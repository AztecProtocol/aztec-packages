//! Debug logging for protocol contracts, which log through their own oracle.

// Matches the JS logger's debug level.
global DEBUG_LOG_LEVEL: u32 = 6;

pub fn debug_log_format<let M: u32, let N: u32>(msg: str<M>, args: [Field; N]) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe { log_oracle_wrapper(DEBUG_LOG_LEVEL, msg, args) };
}

unconstrained fn log_oracle_wrapper<let M: u32, let N: u32>(log_level: u32, msg: str<M>, args: [Field; N]) {
    log_oracle(log_level, msg, N, args);
}

#[oracle(aztec_protocol_misc_log)]
unconstrained fn log_oracle<let M: u32, let N: u32>(log_level: u32, msg: str<M>, length: u32, args: [Field; N]) {}
