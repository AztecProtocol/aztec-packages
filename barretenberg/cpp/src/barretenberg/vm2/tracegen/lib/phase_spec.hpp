#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include <cstdint>

namespace bb::avm2::tracegen {

class TxPhaseOffsetsTable {

  public:
    struct Offsets {
        uint32_t read_pi_offset;
        uint32_t write_pi_offset;
        uint32_t read_pi_length_offset;
    };

    static const TxPhaseOffsetsTable& get();

    const Offsets& get_offsets(TransactionPhase phase) const;

  private:
    TxPhaseOffsetsTable();
};

} // namespace bb::avm2::tracegen
