#pragma once
#include "barretenberg/serialize/cbind_fwd.hpp"
#include <vector>

// WASM-exported FFI entry point. Takes msgpack `[ [name, payload] ]`,
// returns msgpack `[name, payload]`. See c_bind.cpp for the implementation
// (calls the codegen-emitted `make_bb_handler` dispatcher).
CBIND_DECL(ipc_ffi_entry)
