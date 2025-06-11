#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::testing {

class PublicInputsBuilder {
  public:
    PublicInputsBuilder()
        : engine(numeric::get_debug_randomness())
    {}

    PublicInputsBuilder& with_global_variables(const GlobalVariables& globals);
    PublicInputsBuilder& with_start_tree_snapshots(const TreeSnapshots& start_tree_snapshots);
    PublicInputsBuilder& with_start_gas_used(const Gas& gas);
    PublicInputsBuilder& with_gas_settings(const GasSettings& gas_settings);
    PublicInputsBuilder& with_fee_payer(const AztecAddress& fee_payer);
    PublicInputsBuilder& with_public_setup_call_requests(
        const std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX>& public_setup_call_requests);
    PublicInputsBuilder& with_public_app_logic_call_requests(
        const std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX>& public_app_logic_call_requests);
    PublicInputsBuilder& with_public_teardown_call_request(const PublicCallRequest& public_teardown_call_request);
    PublicInputsBuilder& with_previous_non_revertible_accumulated_data(
        const PrivateToAvmAccumulatedData& previous_non_revertible_accumulated_data);
    PublicInputsBuilder& with_previous_revertible_accumulated_data(
        const PrivateToAvmAccumulatedData& previous_revertible_accumulated_data);
    PublicInputsBuilder& with_previous_non_revertible_accumulated_data_array_lengths(
        const PrivateToAvmAccumulatedDataArrayLengths& previous_non_revertible_accumulated_data_array_lengths);
    PublicInputsBuilder& with_previous_revertible_accumulated_data_array_lengths(
        const PrivateToAvmAccumulatedDataArrayLengths& previous_revertible_accumulated_data_array_lengths);

    // Outputs
    PublicInputsBuilder& set_end_tree_snapshots(const TreeSnapshots& end_tree_snapshots);
    PublicInputsBuilder& set_end_gas_used(const Gas& end_gas_used);
    PublicInputsBuilder& set_accumulated_data_array_lengths(
        const AvmAccumulatedDataArrayLengths& accumulated_data_array_lengths);
    PublicInputsBuilder& set_accumulated_data(const AvmAccumulatedData& accumulated_data);
    PublicInputsBuilder& set_transaction_fee(const FF& transaction_fee);
    PublicInputsBuilder& set_reverted(bool reverted);

    PublicInputsBuilder& rand_global_variables();
    PublicInputsBuilder& rand_start_tree_snapshots();
    PublicInputsBuilder& rand_start_gas_used();
    PublicInputsBuilder& rand_gas_settings();
    PublicInputsBuilder& rand_fee_payer();
    PublicInputsBuilder& rand_previous_non_revertible_accumulated_data(size_t n);
    PublicInputsBuilder& rand_previous_revertible_accumulated_data(size_t n);

    PublicInputsBuilder& rand_public_setup_call_requests(size_t n);
    PublicInputsBuilder& rand_public_app_logic_call_requests(size_t n);
    PublicInputsBuilder& rand_public_teardown_call_request();

    PublicInputs build() const;

  private:
    PublicInputs public_inputs;
    numeric::RNG& engine;
};

} // namespace bb::avm2::testing
