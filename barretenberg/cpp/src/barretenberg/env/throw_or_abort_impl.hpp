// Defined by this module for native builds, and by barretenberg/wasi for the wasm reactor.
#include "barretenberg/common/wasm_export.hpp"

extern "C" void throw_or_abort_impl [[noreturn]] (char const*);
