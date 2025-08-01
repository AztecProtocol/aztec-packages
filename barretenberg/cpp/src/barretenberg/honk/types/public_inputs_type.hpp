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

// Number of bb::fr elements used to represent a pair {P0, P1} of points in the public inputs
// Note that the formula assumes BIGGROUP_PUBLIC_INPUTS_SIZE == GOBLIN_GROUP_PUBLIC_INPUTS_SIZE
static constexpr std::size_t PAIRING_POINTS_SIZE = 2 * BIGGROUP_PUBLIC_INPUTS_SIZE;

// Number of bb::fr elements used to represent a opening claim (C, (r, p(r))) over Grumpkin
// Formula is: a point on Grumpkin (2 * FR_PUBLIC_INPUTS_SIZE) and two points on bb::fq (2 *
// BIGFIELD_PUBLIC_INPUTS_SIZE)
static constexpr std::size_t GRUMPKIN_OPENING_CLAIM_SIZE = 2 * FR_PUBLIC_INPUTS_SIZE + 2 * BIGFIELD_PUBLIC_INPUTS_SIZE;

// Invalid public input size, used in OpeningClaim<Curve> when Curve is not Grumpkin
static constexpr std::size_t INVALID_PUBLIC_INPUTS_SIZE = 0;

} // namespace bb
