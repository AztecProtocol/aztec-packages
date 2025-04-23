#pragma once

#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2 {

template <typename FF_> struct AvmFullRow {
    using FF = FF_;

    FF AVM2_ALL_ENTITIES;

    // Risky but oh so efficient.
    FF& get_column(ColumnAndShifts col)
    {
        static_assert(sizeof(*this) == sizeof(FF) * static_cast<size_t>(ColumnAndShifts::SENTINEL_DO_NOT_USE));
        return reinterpret_cast<FF*>(this)[static_cast<size_t>(col)];
    }

    const FF& get_column(ColumnAndShifts col) const
    {
        static_assert(sizeof(*this) == sizeof(FF) * static_cast<size_t>(ColumnAndShifts::SENTINEL_DO_NOT_USE));
        return reinterpret_cast<const FF*>(this)[static_cast<size_t>(col)];
    }

    // These are the names used by AllEntities, etc.
    // TODO(fcarreiro): Clean up duplication.
    FF& get(ColumnAndShifts col) { return get_column(col); }
    const FF& get(ColumnAndShifts col) const { return get_column(col); }
};

} // namespace bb::avm2
