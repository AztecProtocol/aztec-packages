#include "basic_contract_deployment.hpp"

#include "contract.hpp"

#include "aztec3/circuits/hash.hpp"
#include "aztec3/circuits/abis/private_circuit_public_inputs.hpp"

namespace aztec3::circuits::apps::test_apps::basic_contract_deployment {

using aztec3::circuits::abis::OptionalPrivateCircuitPublicInputs;

OptionalPrivateCircuitPublicInputs<NT> constructor(FunctionExecutionContext& exec_ctx,
                                                   std::array<NT::fr, ARGS_LENGTH> const& args)
{
    /****************************************************************
     * PREAMBLE
     ****************************************************************/

    // Make the exec_ctx aware of the contract's layout.
    Contract contract = init_contract();
    exec_ctx.register_contract(&contract);

    // Convert params into circuit types:
    auto& composer = exec_ctx.composer;

    CT::fr const arg0 = to_ct(composer, args[0]);
    CT::fr const arg1 = to_ct(composer, args[1]);
    CT::fr const arg2 = to_ct(composer, args[2]);

    auto& oracle = exec_ctx.oracle;
    const CT::address msg_sender = oracle.get_msg_sender();

    /****************************************************************
     * BODY
     ****************************************************************/
    // SKIPPED

    /****************************************************************
     * CLEANUP
     ****************************************************************/

    // Push args to the public inputs.
    // TODO: don't give function direct access to the exec_ctx?
    auto& public_inputs = exec_ctx.private_circuit_public_inputs;

    std::array<CT::fr, ARGS_LENGTH> args_hash_preimage = utils::zero_array<CT::fr, ARGS_LENGTH>();
    args_hash_preimage[0] = arg0;
    args_hash_preimage[1] = arg1;
    args_hash_preimage[2] = arg2;
    public_inputs.args_hash = compute_args_hash<CT>(args_hash_preimage);

    exec_ctx.finalise();

    // info("public inputs: ", public_inputs);

    return public_inputs.to_native_type<C>();
}

}  // namespace aztec3::circuits::apps::test_apps::basic_contract_deployment
