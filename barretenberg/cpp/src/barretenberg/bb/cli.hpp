#pragma once

namespace bb {
int parse_and_run_cli_command(int argc, char* argv[]);
}

// C wrapper for Zig FFI
extern "C" {
int bb_parse_and_run_cli_command_c(int argc, char* argv[]);
}
