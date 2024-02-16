#include "execution_trace.hpp"

namespace bb {
// template <class Flavor>
// std::shared_ptr<typename Flavor::ProvingKey> ExecutionTrace_<Flavor>::generate(Builder& builder,
//                                                                                size_t dyadic_circuit_size)
// {
//     auto trace_data = generate_trace_polynomials(builder, dyadic_circuit_size);

//     if constexpr (IsHonkFlavor<Flavor>) {
//         return generate_honk_proving_key(trace_data, builder, dyadic_circuit_size);
//     } else if constexpr (IsPlonkFlavor<Flavor>) {
//         return generate_plonk_proving_key(trace_data, builder, dyadic_circuit_size);
//     }
// }
} // namespace bb