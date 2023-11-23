#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/proof_system/circuit_builder/circuit_builder_base.hpp"

#include "barretenberg/flavor/generated/AvmMini_flavor.hpp"
#include "barretenberg/relations/generated/AvmMini.hpp"

using namespace barretenberg;

namespace proof_system {

class AvmMiniTraceBuilder {
  public:
    using Flavor = proof_system::honk::flavor::AvmMiniFlavor;
    using FF = Flavor::FF;
    using Row = AvmMini_vm::Row<FF>;

    static std::vector<Row> build_trace();
};
} // namespace proof_system
