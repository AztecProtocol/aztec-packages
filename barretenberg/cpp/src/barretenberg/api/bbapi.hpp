#pragma once
/**
 * @file bbapi_commands.hpp
 * @brief Central command definitions BB's outward-facing API.
 *
 * This file includes and exports all command structures from specialized headers
 * and provides unified Command and CommandResponse types for the API.
 */
#include "barretenberg/api/bbapi_client_ivc.hpp"
#include "barretenberg/api/bbapi_shared.hpp"
#include "barretenberg/api/bbapi_ultra_honk.hpp"
#include "barretenberg/common/named_union.hpp"

namespace bb::bbapi {
using Command = NamedUnion<CircuitProve,
                           CircuitComputeVk,
                           CircuitInfo,
                           CircuitCheck,
                           CircuitVerify,
                           ClientIvcComputeStandaloneVk,
                           ClientIvcComputeIvcVk,
                           ClientIvcStart,
                           ClientIvcLoad,
                           ClientIvcAccumulate,
                           ClientIvcProve,
                           ProofAsFields,
                           VkAsFields,
                           CircuitWriteSolidityVerifier,
                           CircuitProveAndVerify,
                           CircuitWriteBytecode,
                           CircuitValidate,
                           CircuitBenchmark,
                           ClientIvcCheckPrecomputedVk>;

using CommandResponse = NamedUnion<CircuitProve::Response,
                                   CircuitComputeVk::Response,
                                   CircuitInfo::Response,
                                   CircuitCheck::Response,
                                   CircuitVerify::Response,
                                   ClientIvcComputeStandaloneVk::Response,
                                   ClientIvcComputeIvcVk::Response,
                                   ClientIvcStart::Response,
                                   ClientIvcLoad::Response,
                                   ClientIvcAccumulate::Response,
                                   ClientIvcProve::Response,
                                   ProofAsFields::Response,
                                   VkAsFields::Response,
                                   CircuitWriteSolidityVerifier::Response,
                                   CircuitProveAndVerify::Response,
                                   CircuitWriteBytecode::Response,
                                   CircuitValidate::Response,
                                   CircuitBenchmark::Response,
                                   ClientIvcCheckPrecomputedVk::Response>;

// Specifically check for ClientIvcStart, ClientIvcLoad, ClientIvcAccumulate, and ClientIvcProve
// Helps type-check C++ code, but we don't use this distinction for RPC commands or WASM.
template <typename T>
concept RequiresBBApiRequest = std::is_same_v<T, ClientIvcStart> || std::is_same_v<T, ClientIvcLoad> ||
                               std::is_same_v<T, ClientIvcAccumulate> || std::is_same_v<T, ClientIvcProve>;
} // namespace bb::bbapi
