# External Audit Scope: polynomial

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD (link)

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `polynomials/backing_memory.cpp`
2. `polynomials/backing_memory.hpp`
3. `polynomials/barycentric.hpp`
4. `polynomials/eq_polynomial.hpp`
5. `polynomials/evaluation_domain.cpp`
6. `polynomials/evaluation_domain.hpp`
7. `polynomials/iterate_over_domain.hpp`
8. `polynomials/polynomial.cpp`
9. `polynomials/polynomial.hpp`
10. `polynomials/polynomial_arithmetic.cpp`
11. `polynomials/polynomial_arithmetic.hpp`
12. `polynomials/shared_shifted_virtual_zeroes_array.hpp`
13. `polynomials/univariate_coefficient_basis.hpp`

## Summary of Module

The `polynomial` module provides core polynomial representations and operations used throughout the Barretenberg proving system. It includes implementations for polynomial storage (backing memory), evaluation domains (FFT domains), polynomial arithmetic operations (addition, multiplication, division), and specialized polynomial types such as barycentric forms, equality polynomials, and univariate coefficient basis polynomials. The module handles both coefficient and evaluation representations, supporting efficient transformations between them via FFT operations.

## Test Files
1. `polynomials/univariate_coefficient_basis.test.cpp`
2. `polynomials/eq_polynomial.test.cpp`
3. `polynomials/barycentric.test.cpp`
4. `polynomials/polynomial.test.cpp`
5. `polynomials/polynomial_arithmetic.test.cpp`
6. `polynomials/univariate.test.cpp`
7. `polynomials/gate_separator.test.cpp`

## Security Mechanisms
None identified.
