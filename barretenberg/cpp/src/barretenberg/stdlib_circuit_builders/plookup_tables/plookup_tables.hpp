#pragma once
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"

namespace bb::plookup {

// TODO(@zac-williamson) convert these into static const members of a struct
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::unique_ptr<std::array<MultiTable, MultiTableId::NUM_MULTI_TABLES>> MULTI_TABLES;

const MultiTable& get_multitable(MultiTableId id);

ReadData<bb::fr> get_lookup_accumulators(MultiTableId id,
                                         const bb::fr& key_a,
                                         const bb::fr& key_b = 0,
                                         bool is_2_to_1_lookup = false);

BasicTable create_basic_table(BasicTableId id, size_t index);
} // namespace bb::plookup
