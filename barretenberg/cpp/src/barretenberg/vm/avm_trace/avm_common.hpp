#pragma once

#include "barretenberg/proof_system/circuit_builder/circuit_builder_base.hpp"
#include "barretenberg/proof_system/circuit_builder/generated/avm_circuit_builder.hpp"
#include <cstdint>

namespace bb::avm_trace {

using Flavor = bb::AvmFlavor;
using FF = Flavor::FF;
using Row = bb::AvmFullRow<bb::fr>;

// Number of rows
static const size_t AVM_TRACE_SIZE = 256;
enum class IntermRegister : uint32_t { IA = 0, IB = 1, IC = 2 };

// Keep following enum in sync with MAX_NEM_TAG below
enum class AvmMemoryTag : uint32_t { U0 = 0, U8 = 1, U16 = 2, U32 = 3, U64 = 4, U128 = 5, FF = 6 };
static const uint32_t MAX_MEM_TAG = 6;

} // namespace bb::avm_trace
