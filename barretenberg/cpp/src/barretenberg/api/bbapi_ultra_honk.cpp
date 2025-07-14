#include "barretenberg/api/bbapi_ultra_honk.hpp"
#include "barretenberg/api/bbapi_shared.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <iomanip>
#include <sstream>

namespace bb::bbapi {

CircuitProve::Response CircuitProve::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet!");
}

CircuitComputeVk::Response CircuitComputeVk::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet!");
}

CircuitInfo::Response CircuitInfo::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet!");
}

CircuitCheck::Response CircuitCheck::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet!");
}

CircuitVerify::Response CircuitVerify::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet!");
}

ProofAsFields::Response ProofAsFields::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet!");
}

VkAsFields::Response VkAsFields::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet!");
}

CircuitWriteSolidityVerifier::Response CircuitWriteSolidityVerifier::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet");
}

CircuitProveAndVerify::Response CircuitProveAndVerify::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet!");
}

CircuitBenchmark::Response CircuitBenchmark::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet!");
}

} // namespace bb::bbapi
