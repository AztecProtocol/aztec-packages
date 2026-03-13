#include "bbapi_batch_verifier.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

#ifndef __wasm__
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"

namespace bb::bbapi {

// Static service instance persists across RPC calls
static ChonkBatchVerifierService service_;

ChonkBatchVerifierStart::Response ChonkBatchVerifierStart::execute(const BBApiRequest& /*request*/) &&
{
    if (service_.is_running()) {
        throw_or_abort("ChonkBatchVerifierStart: service already running. Call ChonkBatchVerifierStop first.");
    }

    using VerificationKey = Chonk::MegaVerificationKey;

    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> parsed_vks;
    parsed_vks.reserve(vks.size());

    for (size_t i = 0; i < vks.size(); ++i) {
        validate_vk_size<VerificationKey>(vks[i]);
        auto vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vks[i]));
        parsed_vks.push_back(std::make_shared<MegaZKFlavor::VKAndHash>(vk));
    }

    BatchVerifierConfig config{
        .num_cores = num_cores,
        .batch_size = batch_size,
    };

    service_.start(std::move(parsed_vks), config, fifo_path);
    return {};
}

ChonkBatchVerifierQueue::Response ChonkBatchVerifierQueue::execute(const BBApiRequest& /*request*/) &&
{
    if (!service_.is_running()) {
        throw_or_abort("ChonkBatchVerifierQueue: service not running. Call ChonkBatchVerifierStart first.");
    }

    // Convert raw field element bytes to structured ChonkProof
    auto fields = many_from_buffer<fr>(proof_fields);
    auto proof = ChonkProof::from_field_elements(fields);

    service_.enqueue(VerifyRequest{
        .request_id = request_id,
        .vk_index = vk_index,
        .proof = std::move(proof),
    });

    return {};
}

ChonkBatchVerifierStop::Response ChonkBatchVerifierStop::execute(const BBApiRequest& /*request*/) &&
{
    if (!service_.is_running()) {
        throw_or_abort("ChonkBatchVerifierStop: service not running.");
    }

    service_.stop();
    return {};
}

} // namespace bb::bbapi

#else // __wasm__

namespace bb::bbapi {

ChonkBatchVerifierStart::Response ChonkBatchVerifierStart::execute(const BBApiRequest& /*request*/) &&
{
    throw_or_abort("ChonkBatchVerifierStart is not supported in WASM builds");
}

ChonkBatchVerifierQueue::Response ChonkBatchVerifierQueue::execute(const BBApiRequest& /*request*/) &&
{
    throw_or_abort("ChonkBatchVerifierQueue is not supported in WASM builds");
}

ChonkBatchVerifierStop::Response ChonkBatchVerifierStop::execute(const BBApiRequest& /*request*/) &&
{
    throw_or_abort("ChonkBatchVerifierStop is not supported in WASM builds");
}

} // namespace bb::bbapi

#endif // __wasm__
