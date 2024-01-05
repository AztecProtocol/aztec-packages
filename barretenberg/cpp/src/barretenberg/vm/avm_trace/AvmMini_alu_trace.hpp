#pragma once

#include "AvmMini_common.hpp"

namespace avm_trace {

class AvmMiniAluTraceBuilder {

  public:
    struct AluTraceEntry {};

    AvmMiniAluTraceBuilder();

    void reset();

    std::vector<AluTraceEntry> finalize();

  private:
    std::vector<AluTraceEntry> alu_trace;
};
} // namespace avm_trace