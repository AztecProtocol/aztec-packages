#pragma once

#include "barretenberg/vm/avm/generated/composer.hpp"
#include "barretenberg/vm/avm/generated/prover.hpp"
#include "barretenberg/vm/avm/generated/verifier.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "helpers.test.hpp"

#include <cstddef>
#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <string>
#include <vector>

static const uint32_t DEFAULT_INITIAL_DA_GAS = 1000000;
static const uint32_t DEFAULT_INITIAL_L2_GAS = 1000000;