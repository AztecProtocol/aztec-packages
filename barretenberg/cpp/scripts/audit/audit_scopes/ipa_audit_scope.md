# IPA AUDIT

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 05a381f8b31ae4648e480f1369e911b148216e8b


The content of the IPA recursive verifier may be found together with the prover and native verifier, in
* `barretenberg/commitment_schemes/ipa/ipa.hpp`.

The primary object of the audit is the recursive verifier.

Testing may be found in
* (native) `barretenberg/commitment_schemes/ipa/ipa.test.cpp` and
* (recursive) `barretenberg/commitment_schemes_recursion/ipa_recursive.test.cpp`

The security mechanisms we use:
* fuzzer `barretenberg/commitment_schemes/ipa/ipa.fuzzer.cpp`
* Boomerang detector `barretenberg/boomerang_value_detection/graph_description_ipa_recursive.test.cpp`
