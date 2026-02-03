#pragma once
/**
 * @file bbapi_commands.hpp
 * @brief Central command definitions BB's outward-facing API.
 *
 * This file includes and exports all command structures from specialized headers
 * and provides unified Command and CommandResponse types for the API.
 */
#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/common/named_union.hpp"
