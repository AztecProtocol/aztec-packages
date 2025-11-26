#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;

TEST(ClassIdDerivationTraceGenTest, TraceGeneration)
{
    TestTraceContainer trace;
    ClassIdDerivationTraceBuilder builder;

    ContractClassWithCommitment klass{
        .id = FF(0xdeadbeef),
        .artifact_hash = FF(12),
        .private_functions_root = FF(23),
        .packed_bytecode = {},
        .public_bytecode_commitment = FF(45),
    };
    builder.process({ { .klass = klass } }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(ROW_FIELD_EQ(class_id_derivation_sel, 1),
                          ROW_FIELD_EQ(class_id_derivation_class_id, FF(0xdeadbeef)),
                          ROW_FIELD_EQ(class_id_derivation_artifact_hash, FF(12)),
                          ROW_FIELD_EQ(class_id_derivation_private_functions_root, FF(23)),
                          ROW_FIELD_EQ(class_id_derivation_public_bytecode_commitment, FF(45)))));
}

} // namespace
} // namespace bb::avm2::tracegen
