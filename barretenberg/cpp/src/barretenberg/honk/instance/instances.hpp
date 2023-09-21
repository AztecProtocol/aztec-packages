
namespace proof_system::honk {

template <typename Flavor_, size_t NUM_> struct ProverInstances {
    using Flavor = Flavor_;
    using Instance = ProverInstance_<class Flavor>;
    using ArrayType = std::array<Instance, NUM>;
    static constexpr size_t NUM = NUM_;
    ArrayType _data;
    Instance const& operator[](size_t idx) const { return _data[idx]; }
    typename ArrayType::iterator begin() { return _data.begin(); };
    typename ArrayType::iterator end() { return _data.end(); };
}

template <typename Flavor_, size_t NUM_>
struct VerifierInstances {
    using Flavor = Flavor_;
    using Instance = VerifierInstance_<class Flavor>;
    using ArrayType = std::array<Instance, NUM>;
    static constexpr size_t NUM = NUM_;
    ArrayType _data;
    Instance const& operator[](size_t idx) const { return _data[idx]; }
    typename ArrayType::iterator begin() { return _data.begin(); };
    typename ArrayType::iterator end() { return _data.end(); };
}
} // namespace proof_system::honk