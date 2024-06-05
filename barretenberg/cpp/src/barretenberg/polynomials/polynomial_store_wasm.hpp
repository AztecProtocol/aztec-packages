#pragma once
#include <stddef.h>
#include <string>
#include <unordered_map>

#include "barretenberg/polynomials/polynomial.hpp"

namespace bb {

template <typename Fr> class PolynomialStoreWasm {
  private:
    using Polynomial = bb::Polynomial<Fr>;
    std::unordered_map<std::string, size_t> size_map;

  public:
    void put(std::string const& key, Polynomial&& value);

    Polynomial get(std::string const& key);
};

} // namespace bb
