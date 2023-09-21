#pragma once
#include "barretenberg/honk/instance/prover_instance.hpp"
#include "barretenberg/honk/instance/verifier_instance.hpp"
namespace proof_system::honk {

template <typename Flavor_, size_t NUM_> struct ProverInstances {
    using Flavor = Flavor_;
    using Instance = ProverInstance_<Flavor>;
    using ArrayType = std::array<Instance, NUM_>;

  public:
    static constexpr size_t NUM = NUM_;
    ArrayType _data;
    Instance const& operator[](size_t idx) const { return _data[idx]; }
    typename ArrayType::iterator begin() { return _data.begin(); };
    typename ArrayType::iterator end() { return _data.end(); };
    ProverInstances()
        : _data({ 0, 0, 0, 0, 0 }){};
    ~ProverInstances();
};

template <typename Flavor_, size_t NUM_> struct VerifierInstances {
    using Flavor = Flavor_;
    using Instance = VerifierInstance_<Flavor>;
    using ArrayType = std::array<Instance, NUM_>;

  public:
    static constexpr size_t NUM = NUM_;
    ArrayType _data;
    Instance const& operator[](size_t idx) const { return _data[idx]; }
    typename ArrayType::iterator begin() { return _data.begin(); };
    typename ArrayType::iterator end() { return _data.end(); };
    ~VerifierInstances();
};
} // namespace proof_system::honk