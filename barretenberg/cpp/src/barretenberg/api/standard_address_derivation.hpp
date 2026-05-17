#ifndef __wasm__
#pragma once

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb {

/**
 * @brief Derive standard-contract addresses from freshly-compiled Noir artifacts and emit them
 *        as a `standard_addresses.nr` Noir module suitable for compilation against by other
 *        aztec-nr-using contracts.
 *
 * This is the C++ entrypoint for the `bb derive_standard_contract_addresses` subcommand, used
 * by `noir-projects/noir-contracts/bootstrap.sh` to derive the auth_registry / public_checks /
 * multi_call_entrypoint addresses BEFORE the second-phase Noir compile that bakes them into
 * dependent contracts. Running address derivation here (in C++) instead of in TypeScript breaks
 * the build-order chicken-and-egg: the TS generator needs `@aztec/stdlib`, which can't be built
 * until after the Noir contracts compile, but the Noir contracts need the addresses to be
 * baked-in before they compile.
 *
 * The config-file argument lists one entry per standard contract. Each entry names the freshly-
 * compiled artifact, a precomputed `class_id_preimage` (whose `artifact_hash` and
 * `private_functions_root` are provided by the TS generator — see "Known limitations" below),
 * and the Noir constant name to emit. The same generated content is written to every path in
 * `output_paths`, supporting the aztec/aztec_sublib twin layout without introducing a shared
 * crate.
 *
 * Known limitations of this prototype:
 * - `artifact_hash` and `private_functions_root` are READ from the config file rather than
 *   computed from the artifact. Porting their TS derivation (sha256-reduced-to-Fr merkle over
 *   selector + metadata hashes, plus deterministic-JSON-stringify of contract outputs) to C++
 *   is mechanical but verbose — punted for a follow-up. The other primitives in the address
 *   derivation chain ARE computed in C++ from the artifact: public bytecode commitment from
 *   the freshly-built `public_dispatch` bytecode, contract class id, initialization hash, and
 *   the final partial-address-plus-curve-arithmetic step.
 *
 * @param config_path JSON config listing entries (see derive_standard_addresses.cpp for format)
 * @return true on success, false on failure (parsing, hash derivation, file IO)
 */
bool derive_standard_contract_addresses(const std::filesystem::path& config_path);

} // namespace bb
#endif
