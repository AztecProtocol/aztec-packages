#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"

namespace acir_format {

struct ClientIVCAccumulationConstraint {
    std::vector<uint32_t> key;
    std::vector<uint32_t> proof;
    std::vector<uint32_t> public_inputs;
    uint32_t key_hash;

    friend bool operator==(ClientIVCAccumulationConstraint const& lhs,
                           ClientIVCAccumulationConstraint const& rhs) = default;
};

// WORKTODO: implement FoldingVerifierAccumulator?
void create_client_ivc_accumulation_constraints(bb::MegaCircuitBuilder&,
                                                const ClientIVCAccumulationConstraint&,
                                                const bb::ClientIVC&);
} // namespace acir_format
