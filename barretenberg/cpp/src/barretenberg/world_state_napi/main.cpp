#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <iostream>

int main()
{
    auto x = bb::fr(1);
    std::cout << "Hello, World! " << x << "\n";
    return 0;
}
