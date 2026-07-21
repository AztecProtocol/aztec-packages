use aztec::macros::aztec;

#[aztec]
pub contract LoggingExample {
    // docs:start:logging_imports
    use aztec::oracle::logging::{
        debug_log, debug_log_format, error_log, error_log_format, fatal_log, fatal_log_format,
        info_log, info_log_format, trace_log, trace_log_format, verbose_log, verbose_log_format,
        warn_log, warn_log_format,
    };
    // docs:end:logging_imports
    use aztec::{
        macros::functions::{external, initializer},
        protocol::{address::AztecAddress, traits::ToField},
    };

    #[initializer]
    #[external("public")]
    fn constructor() {}

    #[external("private")]
    fn log_private(value: Field) {
        // docs:start:log_simple
        // Simple messages (no arguments)
        info_log("Private function called");
        debug_log("Checkpoint reached in private function");
        // docs:end:log_simple

        // Messages with format arguments
        debug_log_format("Processing value: {0}", [value]);
    }

    // docs:start:log_address
    #[external("private")]
    fn log_with_address(sender: AztecAddress) {
        info_log_format("Sender: {0}", [sender.to_field()]);
    }
    // docs:end:log_address

    // docs:start:log_public
    #[external("public")]
    fn log_public(value: Field) {
        info_log("Public function called");
        debug_log_format("Public value: {0}", [value]);
    }
    // docs:end:log_public

    // docs:start:log_all_levels
    #[external("private")]
    fn log_all_levels(value: Field) {
        fatal_log("fatal level message");
        fatal_log_format("fatal: {0}", [value]);
        error_log("error level message");
        error_log_format("error: {0}", [value]);
        warn_log("warn level message");
        warn_log_format("warn: {0}", [value]);
        info_log("info level message");
        info_log_format("info: {0}", [value]);
        verbose_log("verbose level message");
        verbose_log_format("verbose: {0}", [value]);
        debug_log("debug level message");
        debug_log_format("debug: {0}", [value]);
        trace_log("trace level message");
        trace_log_format("trace: {0}", [value]);
    }
    // docs:end:log_all_levels

    // docs:start:log_format_patterns
    #[external("private")]
    fn log_format_patterns(a: Field, b: Field, c: Field) {
        // Single indexed argument
        debug_log_format("First value: {0}", [a]);

        // Multiple indexed arguments
        info_log_format("Values: {0}, {1}, {2}", [a, b, c]);

        // Whole array dump
        debug_log_format("All values: {}", [a, b, c]);
    }
    // docs:end:log_format_patterns

    #[external("utility")]
    unconstrained fn log_utility(value: Field) {
        debug_log("Utility function called");
        debug_log_format("Utility value: {0}", [value]);
    }
}
