#pragma once
#include "./mock/mock_circuit.hpp"

namespace bb::join_split_example::proofs {

template <typename Builder, typename Tx, typename CircuitData, typename F>
auto verify_logic_internal(Builder& builder, Tx& tx, CircuitData const& cd, char const* name, F const& build_circuit)
{
    info(name, ": Building circuit...");
    Timer timer;
    auto result = build_circuit(builder, tx, cd);
    info(name, ": Circuit built in ", timer.toString(), "s");

    if (builder.failed()) {
        info(name, ": Circuit logic failed: " + builder.err());
        result.err = builder.err();
        return result;
    }

    if (!cd.srs) {
        info(name, ": Srs not provided.");
        return result;
    }

    if (!pairing_check(result.aggregation_state, cd.srs->get_verifier_crs())) {
        info(name, ": Native pairing check failed.");
        return result;
    }

    result.public_inputs = builder.get_public_inputs();
    result.logic_verified = true;
    result.number_of_gates = builder.get_num_gates();

    return result;
}

} // namespace bb::join_split_example::proofs
