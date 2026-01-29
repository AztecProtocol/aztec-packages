#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <functional>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <span>
#include <unordered_map>
#include <utility>

#include "barretenberg/common/tuple.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/lib/trace_conversion.hpp"

/// WARNING: here is a hack. But we are in the fuzzer code, so it is okay.
/// We need to undefine private to access the trace member of TraceContainer.
#pragma push_macro("private")
#define private public
#include "barretenberg/vm2/tracegen/trace_container.hpp"
#pragma pop_macro("private")

namespace bb::avm2::fuzzer {

// TraceContainer clone with a deep-copying copy constructor/assignment.
// Uses the public TraceContainer API to stay compatible with vm2 tracegen builders.
class CopyableTraceContainer : public bb::avm2::tracegen::TraceContainer {
  public:
    CopyableTraceContainer() = default;
    ~CopyableTraceContainer() = default;
    CopyableTraceContainer(const CopyableTraceContainer& other)
    {
        for (size_t col = 0; col < num_columns(); ++col) {
            auto& dst = (*trace)[col];
            auto& src = (*other.trace)[col];
            std::shared_lock src_lock(src.mutex);
            std::unique_lock dst_lock(dst.mutex);
            dst.rows = src.rows;
            dst.max_row_number = src.max_row_number;
            dst.row_number_dirty = src.row_number_dirty;
        }
    }
    explicit CopyableTraceContainer(const TraceContainer& other)
    {
        for (size_t col = 0; col < num_columns(); ++col) {
            auto& dst = (*trace)[col];
            auto& src = (*other.trace)[col];
            std::shared_lock src_lock(src.mutex);
            std::unique_lock dst_lock(dst.mutex);
            dst.rows = src.rows;
            dst.max_row_number = src.max_row_number;
            dst.row_number_dirty = src.row_number_dirty;
        }
    }
    CopyableTraceContainer(CopyableTraceContainer&&) noexcept = default;
    CopyableTraceContainer& operator=(CopyableTraceContainer&&) noexcept = default;

    CopyableTraceContainer& operator=(const CopyableTraceContainer& other)
    {
        if (this == &other) {
            return *this;
        }
        CopyableTraceContainer copy(other);
        *this = std::move(copy);
        return *this;
    }
};

} // namespace bb::avm2::fuzzer
