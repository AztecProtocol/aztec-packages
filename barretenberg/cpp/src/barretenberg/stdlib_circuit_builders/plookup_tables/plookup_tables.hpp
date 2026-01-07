// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: 4a956ceb179c2fe855e4f1fd78f2594e7fc3f5ea}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"

namespace bb::plookup {

const MultiTable& get_multitable(MultiTableId id);

ReadData<bb::fr> get_lookup_accumulators(MultiTableId id,
                                         const bb::fr& key_a,
                                         const bb::fr& key_b = 0,
                                         bool is_2_to_1_lookup = false);

BasicTable create_basic_table(BasicTableId id, size_t index);
} // namespace bb::plookup
