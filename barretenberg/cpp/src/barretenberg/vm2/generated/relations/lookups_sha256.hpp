// AUTOGENERATED FILE
#pragma once

#include <cstddef>
#include <string_view>
#include <tuple>

#include "../columns.hpp"
#include "barretenberg/relations/generic_lookup/generic_lookup_relation.hpp"
#include "barretenberg/vm2/constraining/relations/interactions_base.hpp"

namespace bb::avm2 {

/////////////////// lookup_sha256_round_constant ///////////////////

struct lookup_sha256_round_constant_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_SHA256_ROUND_CONSTANT";
    static constexpr std::string_view RELATION_NAME = "sha256";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 2;
    static constexpr Column SRC_SELECTOR = Column::sha256_perform_round;
    static constexpr Column DST_SELECTOR = Column::precomputed_sel_sha256_compression;
    static constexpr Column COUNTS = Column::lookup_sha256_round_constant_counts;
    static constexpr Column INVERSES = Column::lookup_sha256_round_constant_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::sha256_round_count, ColumnAndShifts::sha256_round_constant
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::precomputed_clk, ColumnAndShifts::precomputed_sha256_compression_round_constant
    };
};

using lookup_sha256_round_constant_settings = lookup_settings<lookup_sha256_round_constant_settings_>;
template <typename FF_>
using lookup_sha256_round_constant_relation = lookup_relation_base<FF_, lookup_sha256_round_constant_settings>;

} // namespace bb::avm2
