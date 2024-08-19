#include "barretenberg/polynomials/polynomial_iter.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/polynomials/shared_shifted_virtual_zeroes_array.hpp"
#include "polynomial.hpp"
#include "polynomial_arithmetic.hpp"
#include <cstddef>
#include <fcntl.h>
#include <list>
#include <memory>
#include <mutex>
#include <sys/stat.h>
#include <unordered_map>
#include <utility>

namespace bb {

template <typename Fr> PolynomialReference<Fr>& PolynomialReference<Fr>::operator=(const Fr& value)
{
    polynomial_->set(index_, value);
    return *this;
}

template <typename Fr> PolynomialReference<Fr>::operator Fr() const
{
    return polynomial_->get(index_);
}

template class PolynomialReference<bb::fr>;
template class PolynomialReference<grumpkin::fr>;

} // namespace bb