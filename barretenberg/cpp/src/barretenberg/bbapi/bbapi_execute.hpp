#pragma once
/**
 * @file bbapi_execute.hpp
 * @brief BbRequest context and command includes for the bb binary.
 *
 * Command dispatch is handled by the generated server in generated/bb_ipc_server.hpp.
 * This file provides the BbRequest context and includes all command headers.
 */

#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_ecc.hpp"
#include "barretenberg/bbapi/bbapi_ecdsa.hpp"
#include "barretenberg/bbapi/bbapi_schnorr.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"

namespace bb::bbapi {} // namespace bb::bbapi
