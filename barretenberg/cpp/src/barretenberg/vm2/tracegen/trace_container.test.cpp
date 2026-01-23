#include "barretenberg/vm2/tracegen/trace_container.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {
namespace {

TEST(TraceContainerTest, InvertColumns)
{
    using C = Column;
    TraceContainer trace;

    trace.set(C::bc_decomposition_bytes_rem_inv, /*row=*/0, 1);
    trace.set(C::bc_decomposition_bytes_rem_min_one_inv, /*row=*/0, 2);

    trace.set(C::bc_decomposition_bytes_rem_inv, /*row=*/4, 3);
    trace.set(C::bc_decomposition_bytes_rem_min_one_inv, /*row=*/4, 4);

    trace.invert_columns({ { C::bc_decomposition_bytes_rem_inv, C::bc_decomposition_bytes_rem_min_one_inv } });

    EXPECT_EQ(trace.get(C::bc_decomposition_bytes_rem_inv, /*row=*/0), FF(1).invert());
    EXPECT_EQ(trace.get(C::bc_decomposition_bytes_rem_min_one_inv, /*row=*/0), FF(2).invert());

    EXPECT_EQ(trace.get(C::bc_decomposition_bytes_rem_inv, /*row=*/4), FF(3).invert());
    EXPECT_EQ(trace.get(C::bc_decomposition_bytes_rem_min_one_inv, /*row=*/4), FF(4).invert());
}

} // namespace
} // namespace bb::avm2::tracegen
