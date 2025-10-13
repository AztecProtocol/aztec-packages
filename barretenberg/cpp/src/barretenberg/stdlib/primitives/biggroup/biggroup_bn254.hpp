// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
/**
 * Special case function for performing BN254 group operations
 *
 * TODO: we should try to genericize this, but this method is super fiddly and we need it to be efficient!
 *
 * We use a special case algorithm to split bn254 scalar multipliers into endomorphism scalars
 *
 **/
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
namespace bb::stdlib::element_default {} // namespace bb::stdlib::element_default
