#ifndef __wasm__
#include "barretenberg/bbapi/bbapi_batch_verifier.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"

namespace bb::bbapi {

ChonkBatchVerifierStart::Response ChonkBatchVerifierStart::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);

    if (request.batch_verifier_service) {
        BBAPI_ERROR(request, "Batch verifier already running. Call ChonkBatchVerifierStop first.");
    }

    using VerificationKey = Chonk::MegaVerificationKey;

    // Deserialize VKs
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> deserialized_vks;
    deserialized_vks.reserve(vks.size());

    for (size_t i = 0; i < vks.size(); ++i) {
        validate_vk_size<VerificationKey>(vks[i]);
        auto hiding_kernel_vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vks[i]));
        deserialized_vks.push_back(std::make_shared<ChonkNativeVerifier::VKAndHash>(hiding_kernel_vk));
    }

    request.batch_verifier_service = std::make_shared<ChonkBatchVerifierService>();
    request.batch_verifier_service->start(std::move(deserialized_vks), output_fifo_path, config);

    info("ChonkBatchVerifierStart: started with ", vks.size(), " VKs, output_fifo=", output_fifo_path);
    return {};
}

ChonkBatchVerifierQueue::Response ChonkBatchVerifierQueue::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);

    if (!request.batch_verifier_service) {
        BBAPI_ERROR(request, "Batch verifier not running. Call ChonkBatchVerifierStart first.");
    }

    VerifyRequest vr{
        .request_id = request_id,
        .proof = std::move(proof),
        .vk_index = vk_index,
    };

    bool accepted = request.batch_verifier_service->queue(std::move(vr));
    return { .accepted = accepted };
}

ChonkBatchVerifierStop::Response ChonkBatchVerifierStop::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);

    if (!request.batch_verifier_service) {
        BBAPI_ERROR(request, "Batch verifier not running.");
    }

    request.batch_verifier_service->stop();
    request.batch_verifier_service.reset();

    info("ChonkBatchVerifierStop: service stopped");
    return {};
}

} // namespace bb::bbapi
#endif
