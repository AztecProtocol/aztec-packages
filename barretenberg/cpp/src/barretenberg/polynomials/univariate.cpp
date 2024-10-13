#include "univariate.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb {

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>::Univariate(std::array<Fr, LENGTH> evaluations)
    : evaluations(evaluations)
{}

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>::Univariate(Fr value)
    : evaluations{}
{
    for (size_t i = 0; i < LENGTH; ++i) {
        evaluations[i] = value;
    }
}

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>::Univariate(
    UnivariateView<Fr, domain_end, domain_start, skip_count> in)
{
    for (size_t i = 0; i < in.evaluations.size(); ++i) {
        evaluations[i] = in.evaluations[i];
    }
}

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
bool Univariate<Fr, domain_end, domain_start, skip_count>::operator==(const Univariate& other) const
{
    if (!(evaluations[0] == other.evaluations[0])) {
        return false;
    }
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        if (!(evaluations[i] == other.evaluations[i])) {
            return false;
        }
    }
    return true;
}

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>& Univariate<Fr, domain_end, domain_start, skip_count>::operator+=(
    const Univariate& other)
{
    evaluations[0] += other.evaluations[0];
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        evaluations[i] += other.evaluations[i];
    }
    return *this;
}

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>& Univariate<Fr, domain_end, domain_start, skip_count>::operator-=(
    const Univariate& other)
{
    evaluations[0] -= other.evaluations[0];
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        evaluations[i] -= other.evaluations[i];
    }
    return *this;
}

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>& Univariate<Fr, domain_end, domain_start, skip_count>::operator*=(
    const Univariate& other)
{
    evaluations[0] *= other.evaluations[0];
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        evaluations[i] *= other.evaluations[i];
    }
    return *this;
}

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>& Univariate<Fr, domain_end, domain_start, skip_count>::self_sqr()
{
    evaluations[0].self_sqr();
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        evaluations[i].self_sqr();
    }
    return *this;
}

// Add remaining member functions following the same pattern...

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start> Univariate<Fr, domain_end, domain_start, skip_count>::convert() const noexcept
{
    Univariate<Fr, domain_end, domain_start, 0> result;
    result.evaluations[0] = evaluations[0];
    for (size_t i = 1; i < skip_count + 1; i++) {
        result.evaluations[i] = Fr::zero();
    }
    for (size_t i = skip_count + 1; i < LENGTH; i++) {
        result.evaluations[i] = evaluations[i];
    }
    return result;
}

// Function to add two Univariate instances
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::operator+(
    const Univariate& other) const
{
    Univariate result = *this;
    result += other; // Reuse operator+= for implementation
    return result;
}

// Function to subtract one Univariate instance from another
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::operator-(
    const Univariate& other) const
{
    Univariate result = *this;
    result -= other; // Reuse operator-= for implementation
    return result;
}

// Function to multiply two Univariate instances
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::operator*(
    const Univariate& other) const
{
    Univariate result = *this;
    result *= other; // Reuse operator*= for implementation
    return result;
}

// Function to square a Univariate instance
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::sqr() const
{
    Univariate result = *this;
    result.self_sqr(); // Reuse self_sqr for squaring in-place
    return result;
}

// Function to return the negation (unary minus) of a Univariate instance
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::operator-()
    const
{
    Univariate result;
    result.evaluations[0] = -evaluations[0];
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        result.evaluations[i] = -evaluations[i];
    }
    return result;
}

// Function to add a scalar value to all elements of the Univariate
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::operator+(
    const Fr& scalar) const
{
    Univariate result = *this;
    result.evaluations[0] += scalar; // Add scalar only to the 0th element
    return result;
}

// Function to subtract a scalar value from all elements of the Univariate
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::operator-(
    const Fr& scalar) const
{
    Univariate result = *this;
    result.evaluations[0] -= scalar; // Subtract scalar only from the 0th element
    return result;
}

// Function to multiply all elements of the Univariate by a scalar
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::operator*(
    const Fr& scalar) const
{
    Univariate result;
    result.evaluations[0] = evaluations[0] * scalar;
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        result.evaluations[i] = evaluations[i] * scalar;
    }
    return result;
}

// Function to multiply all elements of the Univariate by a scalar in-place
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>& Univariate<Fr, domain_end, domain_start, skip_count>::operator*=(
    const Fr& scalar)
{
    evaluations[0] *= scalar;
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        evaluations[i] *= scalar;
    }
    return *this;
}

// Function to multiply all elements of the Univariate by a scalar in-place
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>& Univariate<Fr, domain_end, domain_start, skip_count>::operator+=(
    const Fr& scalar)
{
    evaluations[0] += scalar;
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        evaluations[i] += scalar;
    }
    return *this;
}

// Function to multiply all elements of the Univariate by a scalar in-place
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>& Univariate<Fr, domain_end, domain_start, skip_count>::operator-=(
    const Fr& scalar)
{
    evaluations[0] -= scalar;
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        evaluations[i] -= scalar;
    }
    return *this;
}

// Function to get the value of a specific evaluation point
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Fr& Univariate<Fr, domain_end, domain_start, skip_count>::value_at(size_t idx)
{
    if constexpr (domain_start == 0) {
        return evaluations[idx];
    } else {
        return evaluations[idx - domain_start];
    }
}

// Function to get the value of a specific evaluation point
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
const Fr& Univariate<Fr, domain_end, domain_start, skip_count>::value_at(size_t idx) const
{
    if constexpr (domain_start == 0) {
        return evaluations[idx];
    } else {
        return evaluations[idx - domain_start];
    }
}

// Function to return an element-by-element copy of the Univariate with zeroed-out skipped elements
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::
    zero_skipped_elements() const noexcept
{
    Univariate result = *this;
    for (size_t i = 0; i < skip_count; ++i) {
        result.evaluations[i] = Fr::zero(); // Zero-out the skipped elements
    }
    return result;
}

// Function to return a zero polynomial (all evaluations are zero)
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::
    zero() noexcept
{
    Univariate result;
    for (size_t i = 0; i < LENGTH; ++i) {
        result.evaluations[i] = Fr::zero();
    }
    return result;
}

// Definition for the to_buffer function
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
bool Univariate<Fr, domain_end, domain_start, skip_count>::is_zero() const
{
    if (!evaluations[0].is_zero()) {
        return false;
    }
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        if (!evaluations[i].is_zero()) {
            return false;
        }
    }
    return true;
}

// Definition for the to_buffer function
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
std::vector<uint8_t> Univariate<Fr, domain_end, domain_start, skip_count>::to_buffer() const
{
    return ::to_buffer(evaluations);
}

// Definition for the serialize_from_buffer function
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::
    serialize_from_buffer(uint8_t const* buffer)
{
    Univariate result;
    std::read(buffer, result.evaluations);
    return result;
}

// Definition for the serialize_from_buffer function
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::get_random()
{
    Univariate<Fr, domain_end, domain_start, skip_count> output;
    for (size_t i = 0; i != LENGTH; ++i) {
        output.value_at(i) = Fr::random_element();
    }
    return output;
}

// Definition for the serialize_from_buffer function
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::
    random_element()
{
    return get_random();
}

// Adding a UnivariateView to a Univariate
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>& Univariate<Fr, domain_end, domain_start, skip_count>::operator+=(
    const UnivariateView<Fr, domain_end, domain_start, skip_count>& view)
{
    // Add the first element
    evaluations[0] += view.evaluations[0];

    // Add elements after the skip count
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        evaluations[i] += view.evaluations[i];
    }

    return *this; // Return the current object for chaining
}

// Subtracting a UnivariateView from a Univariate
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>& Univariate<Fr, domain_end, domain_start, skip_count>::operator-=(
    const UnivariateView<Fr, domain_end, domain_start, skip_count>& view)
{
    // Subtract the first element
    evaluations[0] -= view.evaluations[0];

    // Subtract elements after the skip count
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        evaluations[i] -= view.evaluations[i];
    }

    return *this; // Return the current object for chaining
}

// Multiplying a Univariate by a UnivariateView element-wise
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count>& Univariate<Fr, domain_end, domain_start, skip_count>::operator*=(
    const UnivariateView<Fr, domain_end, domain_start, skip_count>& view)
{
    // Multiply the first element
    evaluations[0] *= view.evaluations[0];

    // Multiply elements after the skip count
    for (size_t i = skip_count + 1; i < LENGTH; ++i) {
        evaluations[i] *= view.evaluations[i];
    }

    return *this; // Return the current object for chaining
}

// Add UnivariateView to Univariate and return a new Univariate
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::operator+(
    const UnivariateView<Fr, domain_end, domain_start, skip_count>& view) const
{
    Univariate result = *this; // Copy the current Univariate
    result += view;            // Use the operator+= we defined above
    return result;
}

// Subtract UnivariateView from Univariate and return a new Univariate
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::operator-(
    const UnivariateView<Fr, domain_end, domain_start, skip_count>& view) const
{
    Univariate result = *this; // Copy the current Univariate
    result -= view;            // Use the operator-= we defined above
    return result;
}

// Multiply Univariate by UnivariateView element-wise and return a new Univariate
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Univariate<Fr, domain_end, domain_start, skip_count> Univariate<Fr, domain_end, domain_start, skip_count>::operator*(
    const UnivariateView<Fr, domain_end, domain_start, skip_count>& view) const
{
    Univariate result = *this; // Copy the current Univariate
    result *= view;            // Use the operator*= we defined above
    return result;
}

// Multiply Univariate by UnivariateView element-wise and return a new Univariate
template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
Fr Univariate<Fr, domain_end, domain_start, skip_count>::evaluate(const Fr& u) const
{
    using Data = BarycentricData<Fr, domain_end, LENGTH, domain_start>;
    Fr full_numerator_value = 1;
    for (size_t i = domain_start; i != domain_end; ++i) {
        full_numerator_value *= u - i;
    }

    // build set of domain size-many denominator inverses 1/(d_i*(x_k - x_j)). will multiply against
    // each of these (rather than to divide by something) for each barycentric evaluation
    std::array<Fr, LENGTH> denominator_inverses;
    for (size_t i = 0; i != LENGTH; ++i) {
        Fr inv = Data::lagrange_denominators[i];
        inv *= u - Data::big_domain[i]; // warning: need to avoid zero here
        inv = Fr(1) / inv;
        denominator_inverses[i] = inv;
    }

    Fr result = 0;
    // compute each term v_j / (d_j*(x-x_j)) of the sum
    for (size_t i = domain_start; i != domain_end; ++i) {
        Fr term = value_at(i);
        term *= denominator_inverses[i - domain_start];
        result += term;
    }
    // scale the sum by the value of of B(x)
    result *= full_numerator_value;
    return result;
}

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
template <size_t EXTENDED_DOMAIN_END, size_t NUM_SKIPPED_INDICES>
Univariate<Fr, EXTENDED_DOMAIN_END, 0, NUM_SKIPPED_INDICES> Univariate<Fr, domain_end, domain_start, skip_count>::
    extend_to() const
{
    static constexpr size_t EXTENDED_LENGTH = EXTENDED_DOMAIN_END - domain_start;
    using Data = BarycentricData<Fr, LENGTH, EXTENDED_LENGTH>;
    static_assert(EXTENDED_LENGTH >= LENGTH);

    Univariate<Fr, EXTENDED_LENGTH, 0, NUM_SKIPPED_INDICES> result;

    std::copy(evaluations.begin(), evaluations.end(), result.evaluations.begin());

    static constexpr Fr inverse_two = Fr(2).invert();
    static_assert(NUM_SKIPPED_INDICES < LENGTH);
    if constexpr (LENGTH == 2) {
        Fr delta = value_at(1) - value_at(0);
        static_assert(EXTENDED_LENGTH != 0);
        for (size_t idx = domain_end - 1; idx < EXTENDED_DOMAIN_END - 1; idx++) {
            result.value_at(idx + 1) = result.value_at(idx) + delta;
        }
    } else if constexpr (LENGTH == 3) {
        // Based off https://hackmd.io/@aztec-network/SyR45cmOq?type=view
        // The technique used here is the same as the length == 3 case below.
        Fr a = (value_at(2) + value_at(0)) * inverse_two - value_at(1);
        Fr b = value_at(1) - a - value_at(0);
        Fr a2 = a + a;
        Fr a_mul = a2;
        for (size_t i = 0; i < domain_end - 2; i++) {
            a_mul += a2;
        }
        Fr extra = a_mul + a + b;
        for (size_t idx = domain_end - 1; idx < EXTENDED_DOMAIN_END - 1; idx++) {
            result.value_at(idx + 1) = result.value_at(idx) + extra;
            extra += a2;
        }
    } else if constexpr (LENGTH == 4) {
        static constexpr Fr inverse_six = Fr(6).invert(); // computed at compile time for efficiency

        // To compute a barycentric extension, we can compute the coefficients of the univariate.
        // We have the evaluation of the polynomial at the domain (which is assumed to be 0, 1, 2, 3).
        // Therefore, we have the 4 linear equations from plugging into f(x) = ax^3 + bx^2 + cx + d:
        //          a*0 + b*0 + c*0 + d = f(0)
        //          a*1 + b*1 + c*1 + d = f(1)
        //          a*2^3 + b*2^2 + c*2 + d = f(2)
        //          a*3^3 + b*3^2 + c*3 + d = f(3)
        // These equations can be rewritten as a matrix equation M * [a, b, c, d] = [f(0), f(1), f(2),
        // f(3)], where M is:
        //          0,  0,  0,  1
        //          1,  1,  1,  1
        //          2^3, 2^2, 2,  1
        //          3^3, 3^2, 3,  1
        // We can invert this matrix in order to compute a, b, c, d:
        //      -1/6,	1/2,	-1/2,	1/6
        //      1,	    -5/2,	2,	    -1/2
        //      -11/6,	3,	    -3/2,	1/3
        //      1,	    0,	    0,	    0
        // To compute these values, we can multiply everything by 6 and multiply by inverse_six at the
        // end for each coefficient The resulting computation here does 18 field adds, 6 subtracts, 3
        // muls to compute a, b, c, and d.
        Fr zero_times_3 = value_at(0) + value_at(0) + value_at(0);
        Fr zero_times_6 = zero_times_3 + zero_times_3;
        Fr zero_times_12 = zero_times_6 + zero_times_6;
        Fr one_times_3 = value_at(1) + value_at(1) + value_at(1);
        Fr one_times_6 = one_times_3 + one_times_3;
        Fr two_times_3 = value_at(2) + value_at(2) + value_at(2);
        Fr three_times_2 = value_at(3) + value_at(3);
        Fr three_times_3 = three_times_2 + value_at(3);

        Fr one_minus_two_times_3 = one_times_3 - two_times_3;
        Fr one_minus_two_times_6 = one_minus_two_times_3 + one_minus_two_times_3;
        Fr one_minus_two_times_12 = one_minus_two_times_6 + one_minus_two_times_6;
        Fr a = (one_minus_two_times_3 + value_at(3) - value_at(0)) * inverse_six; // compute a in 1 muls and 4 adds
        Fr b = (zero_times_6 - one_minus_two_times_12 - one_times_3 - three_times_3) * inverse_six;
        Fr c = (value_at(0) - zero_times_12 + one_minus_two_times_12 + one_times_6 + two_times_3 + three_times_2) *
               inverse_six;

        // Then, outside of the a, b, c, d computation, we need to do some extra precomputation
        // This work is 3 field muls, 8 adds
        Fr a_plus_b = a + b;
        Fr a_plus_b_times_2 = a_plus_b + a_plus_b;
        size_t start_idx_sqr = (domain_end - 1) * (domain_end - 1);
        size_t idx_sqr_three = start_idx_sqr + start_idx_sqr + start_idx_sqr;
        Fr idx_sqr_three_times_a = Fr(idx_sqr_three) * a;
        Fr x_a_term = Fr(6 * (domain_end - 1)) * a;
        Fr three_a = a + a + a;
        Fr six_a = three_a + three_a;

        Fr three_a_plus_two_b = a_plus_b_times_2 + a;
        Fr linear_term = Fr(domain_end - 1) * three_a_plus_two_b + (a_plus_b + c);
        // For each new evaluation, we do only 6 field additions and 0 muls.
        for (size_t idx = domain_end - 1; idx < EXTENDED_DOMAIN_END - 1; idx++) {
            result.value_at(idx + 1) = result.value_at(idx) + idx_sqr_three_times_a + linear_term;

            idx_sqr_three_times_a += x_a_term + three_a;
            x_a_term += six_a;

            linear_term += three_a_plus_two_b;
        }
    } else {
        for (size_t k = domain_end; k != EXTENDED_DOMAIN_END; ++k) {
            result.value_at(k) = 0;
            // compute each term v_j / (d_j*(x-x_j)) of the sum
            for (size_t j = domain_start; j != domain_end; ++j) {
                Fr term = value_at(j);
                term *= Data::precomputed_denominator_inverses[LENGTH * k + j];
                result.value_at(k) += term;
            }
            // scale the sum by the value of of B(x)
            result.value_at(k) *= Data::full_numerator_values[k];
        }
    }
    return result;
}

template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
template <size_t INITIAL_LENGTH>
void Univariate<Fr, domain_end, domain_start, skip_count>::self_extend_from()
{
    if constexpr (INITIAL_LENGTH == 2) {
        const Fr delta = value_at(1) - value_at(0);
        Fr next = value_at(1);
        for (size_t idx = 2; idx < LENGTH; idx++) {
            next += delta;
            value_at(idx) = next;
        }
    }
}

// template <class Fr, size_t domain_end, size_t domain_start, size_t skip_count>
// std::ostream& operator<<(std::ostream& os, const Univariate<Fr, domain_end, domain_start, skip_count>& u)
// {
//     os << "[";
//     os << u.evaluations[0] << "," << std::endl;
//     for (size_t i = 1; i < u.evaluations.size(); i++) {
//         os << " " << u.evaluations[i];
//         if (i + 1 < u.evaluations.size()) {
//             os << "," << std::endl;
//         } else {
//             os << "]";
//         };
//     }
//     return os;
// }

// polynomials_tests
template class Univariate<bb::fr, 2, 0, 0>;
template class Univariate<bb::fr, 3, 0, 0>;
template class Univariate<bb::fr, 3, 1, 0>;
template class Univariate<bb::fr, 4, 0, 0>;
template class Univariate<bb::fr, 5, 0, 0>;
template class Univariate<bb::fr, 6, 0, 0>;
template class Univariate<bb::fr, 10, 0, 0>;
template class Univariate<bb::fr, 37, 32, 0>;

template void Univariate<bb::fr, 10, 0, 0>::self_extend_from<2>();
template Univariate<bb::fr, 10, 0, 0> Univariate<bb::fr, 2, 0, 0>::extend_to<10, 0>() const;
template Univariate<bb::fr, 3, 0, 0> Univariate<bb::fr, 2, 0, 0>::extend_to<3, 0>() const;
template Univariate<bb::fr, 6, 0, 0> Univariate<bb::fr, 6, 0, 0>::extend_to<6, 0>() const;
template Univariate<bb::fr, 6, 0, 0> Univariate<bb::fr, 5, 0, 0>::extend_to<6, 0>() const;

// utra_honk_tests deduplicated from >8000 insts in linker error
template class Univariate<bb::fr, 7, 0, 0>;
template class Univariate<bb::fr, 8, 0, 0>;
template Univariate<bb::fr, 7, 0, 0> Univariate<bb::fr, 2, 0, 0>::extend_to<7, 0>() const;
template Univariate<bb::fr, 8, 0, 0> Univariate<bb::fr, 2, 0, 0>::extend_to<8, 0>() const;
template Univariate<bb::fr, 8, 0, 0> Univariate<bb::fr, 3, 0, 0>::extend_to<8, 0>() const;
template Univariate<bb::fr, 8, 0, 0> Univariate<bb::fr, 5, 0, 0>::extend_to<8, 0>() const;
template Univariate<bb::fr, 8, 0, 0> Univariate<bb::fr, 6, 0, 0>::extend_to<8, 0>() const;
template Univariate<bb::fr, 8, 0, 0> Univariate<bb::fr, 7, 0, 0>::extend_to<8, 0>() const;

} // namespace bb
