#pragma once

#include <cstdint>

namespace bb {

/**
 * We collect the number of public inputs required to represent the various classes we use
 * Note that these constants should not be imported directly. They should be fetched from the respective structures in
 * the code. For example, instead of importing PAIRING_POINTS_SIZE, we should fetch this value from
 * PairingPoints::PUBLIC_INPUTS_SIZE
 */

// Number of bb::fr elements used to represent an element of bb::fr in the public inputs
static constexpr std::size_t FR_PUBLIC_INPUTS_SIZE = 1;

// Number of bb::fr elements used to represent a bigfield element in the public inputs
static constexpr std::size_t BIGFIELD_PUBLIC_INPUTS_SIZE = 4;

// Number of bb::fr elements used to represent a goblin bigfield element in the public inputs
static constexpr std::size_t GOBLIN_FIELD_PUBLIC_INPUTS_SIZE = 4;

// Number of bb::fr elements used to represent a biggroup element in the public inputs
static constexpr std::size_t BIGGROUP_PUBLIC_INPUTS_SIZE = 2 * BIGFIELD_PUBLIC_INPUTS_SIZE;

// Number of bb::fr elements used to represent a goblin biggroup element in the public inputs
static constexpr std::size_t GOBLIN_GROUP_PUBLIC_INPUTS_SIZE = 2 * GOBLIN_FIELD_PUBLIC_INPUTS_SIZE;

/**
 * Number of bb::fr elements used to represent a pair {P0, P1} of points in the public inputs
 * The formula assumes BIGGROUP_PUBLIC_INPUTS_SIZE == GOBLIN_GROUP_PUBLIC_INPUTS_SIZE, if this assumption
 * becomes incorrect, then the PAIRING_POINTS_SIZE should be split into two values: one for the pairing points used in
 * ClientIVC (Mega arithmetization), and one for the pairing points used in the Rollup (Ultra arithmetization)
 */
static constexpr std::size_t PAIRING_POINTS_SIZE = 2 * GOBLIN_GROUP_PUBLIC_INPUTS_SIZE;

// Number of bb::fr elements used to represent a opening claim (C, (r, p(r))) over Grumpkin
// Formula is: a point on Grumpkin (2 * FR_PUBLIC_INPUTS_SIZE) and two points on bb::fq (2 *
// BIGFIELD_PUBLIC_INPUTS_SIZE)
static constexpr std::size_t GRUMPKIN_OPENING_CLAIM_SIZE = 2 * FR_PUBLIC_INPUTS_SIZE + 2 * BIGFIELD_PUBLIC_INPUTS_SIZE;

// Invalid public input size, used in OpeningClaim<Curve> when Curve is not Grumpkin
static constexpr std::size_t INVALID_PUBLIC_INPUTS_SIZE = 0;

// Number of wires in the Mega execution trace, they must be re-defined to avoid circular dependencies
static constexpr std::size_t MEGA_EXECUTION_TRACE_NUM_WIRES = 4;

// Number of bb::fr elements used to represent the public inputs of an INIT/INNER/RESET/TAIL kernel
static constexpr std::size_t KERNEL_PUBLIC_INPUTS_SIZE =
    /*pairing_inputs*/ PAIRING_POINTS_SIZE +
    /*kernel_return_data*/ GOBLIN_GROUP_PUBLIC_INPUTS_SIZE +
    /*app_return_data*/ GOBLIN_GROUP_PUBLIC_INPUTS_SIZE +
    /*table_commitments*/ (MEGA_EXECUTION_TRACE_NUM_WIRES * GOBLIN_GROUP_PUBLIC_INPUTS_SIZE) +
    /*output_pg_accum_hash*/ FR_PUBLIC_INPUTS_SIZE;

// Number of bb::fr elements used to represent the default public inputs, i.e., the pairing points
static constexpr std::size_t DEFAULT_PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE;

// Number of bb::fr elements used to represent the public inputs of an App circuit
static constexpr std::size_t APP_PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE;

// Number of bb::fr elements used to represent the public inputs of the HIDING kernel
static constexpr std::size_t HIDING_KERNEL_PUBLIC_INPUTS_SIZE =
    /*pairing_inputs*/ PAIRING_POINTS_SIZE +
    /*table_commitments*/ (MEGA_EXECUTION_TRACE_NUM_WIRES * GOBLIN_GROUP_PUBLIC_INPUTS_SIZE);

// Number of bb::fr elements used to represent the public inputs of a ROLLUP circuit
static constexpr std::size_t ROLLUP_PUBLIC_INPUTS_SIZE =
    /*pairing_inputs*/ PAIRING_POINTS_SIZE + /*ipa_claim*/ GRUMPKIN_OPENING_CLAIM_SIZE;

// Number of bb::fr elements used to represent the public inputs of the inner circuit in the GoblinAvmRecursiveVerifier
static constexpr std::size_t GOBLIN_AVM_PUBLIC_INPUTS_SIZE = FR_PUBLIC_INPUTS_SIZE + PAIRING_POINTS_SIZE;

} // namespace bb
