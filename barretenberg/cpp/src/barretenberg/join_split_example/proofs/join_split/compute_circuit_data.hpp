#pragma once
#include "../compute_circuit_data.hpp"
#include "join_split_tx.hpp"

namespace bb::join_split_example::proofs::join_split {

join_split_tx noop_tx();

using circuit_data = proofs::circuit_data;

} // namespace bb::join_split_example::proofs::join_split