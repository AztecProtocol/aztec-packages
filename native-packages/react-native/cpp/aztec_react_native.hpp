#pragma once
/**
 * @file aztec_react_native.hpp
 * @brief What a React Native app needs to run Aztec's client stack, installed into its JavaScript runtime.
 *
 * install() puts on the runtime's global object:
 *   - `__ipcRuntimeJsi`: ipc-runtime's JSI binding (ipc-runtime/cpp/jsi), with the libraries linked into
 *     the app registered under their FFI names (bb, acvm) when AZTEC_REACT_NATIVE_LINKED_LIBRARIES is set;
 *   - `__aztecReactNative`: the platform ("ios", "android"), the app's data directory and functions on its
 *     files (bb.js caches the CRS there), and sha256;
 *   - `crypto.getRandomValues`, when the runtime has none (Hermes), from the OS's generator.
 *
 * It also registers kv-sqlite (kv_sqlite_unit.cpp, compiled into the module) under its FFI name `kv_sqlite`, for
 * the PXE's store.
 */

#include "ipc_runtime_jsi.hpp"

#include <jsi/jsi.h>

#include <string>

namespace aztec::react_native {

/** Installs everything above. Call on the JavaScript thread; `data_dir` is the app's files directory. */
void install(facebook::jsi::Runtime& runtime, ::ipc::jsi::RunOnJs run_on_js, const std::string& data_dir);

} // namespace aztec::react_native
