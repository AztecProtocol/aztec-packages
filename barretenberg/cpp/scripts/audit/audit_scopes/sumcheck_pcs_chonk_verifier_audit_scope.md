# External Audit Scope: Sumcheck + PCS + Chonk Verifier

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD

This scope combines Sumcheck, Polynomial Commitment Schemes, and Chonk verifier components since they are tightly coupled and benefit from being audited together.

---

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Sumcheck
1. `sumcheck/sumcheck.hpp`
2. `sumcheck/sumcheck.cpp`
3. `sumcheck/sumcheck_round.hpp`
4. `sumcheck/sumcheck_output.hpp`
5. `sumcheck/zk_sumcheck_data.hpp`
6. `polynomials/row_disabling_polynomial.hpp`
7. `polynomials/gate_separator.hpp`
8. `polynomials/univariate.hpp`
9. `stdlib/primitives/padding_indicator_array/*.hpp`
10. `relations/nested_containers.hpp`
11. `relations/relation_types.hpp`
12. `relations/utils.hpp`

### PCS (Polynomial Commitment Schemes)
13. `commitment_schemes/shplonk/shplemini.hpp`
14. `commitment_schemes/shplonk/shplonk.hpp`
15. `commitment_schemes/gemini/gemini.hpp`
16. `commitment_schemes/gemini/gemini_impl.hpp`
17. `commitment_schemes/kzg/kzg.hpp`
18. `commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp`
19. `commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.cpp`
20. `commitment_schemes/small_subgroup_ipa/small_subgroup_ipa_utils.hpp`
21. `commitment_schemes/claim_batcher.hpp`
22. `commitment_schemes/claim.hpp`
23. `commitment_schemes/pairing_points.hpp`
24. `commitment_schemes/verification_key.hpp`
25. `stdlib/primitives/pairing_points.hpp`

### ECCVM Prover
26. `eccvm/eccvm_prover.hpp`
27. `eccvm/eccvm_prover.cpp`

### Translator Prover
28. `translator_vm/translator_prover.hpp`
29. `translator_vm/translator_prover.cpp`

### Chonk Prover/Verifier
30. `chonk/chonk.cpp` (**limit to:** `prove()` method)
31. `goblin/goblin_verifier.hpp`
32. `goblin/goblin_verifier.cpp`
33. `goblin/merge_verifier.hpp`
34. `goblin/merge_verifier.cpp`
35. `eccvm/eccvm_verifier.hpp`
36. `eccvm/eccvm_verifier.cpp`
37. `eccvm/eccvm_fixed_vk.hpp`
38. `translator_vm/translator_verifier.hpp`
39. `translator_vm/translator_verifier.cpp`
40. `translator_vm/translator_fixed_vk.hpp`
41. `chonk/chonk_verifier.hpp`
42. `chonk/chonk_verifier.cpp`

### In-Circuit (Recursive) Verifier Components
43. `stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp`
44. `stdlib/eccvm_verifier/verifier_commitment_key.hpp`
45. `stdlib/translator_vm_verifier/translator_recursive_flavor.hpp`
46. `stdlib/honk_verifier/ipa_accumulator.hpp`
47. `stdlib/honk_verifier/ultra_verification_keys_comparator.hpp`

### Supporting Types
48. `goblin/types.hpp`

---

## Test Files

### Sumcheck Tests
| File | Description |
|------|-------------|
| `flavor/sumcheck_test_flavor.hpp` | Simple test flavor with couple of relations |
| `sumcheck/sumcheck.test.cpp` | Tests for sumcheck prove and verify methods |
| `sumcheck/sumcheck_round.test.cpp` | Fine-grained SumcheckRound functions |
| `sumcheck/partial_evaluation.test.cpp` | Partial evaluation of polynomials |
| `sumcheck/row_disabling_polynomial.test.cpp` | Disabling mechanism for rows containing randomness |
| `polynomials/gate_separator.test.cpp` | pow_beta polynomial operations |
| `stdlib/primitives/padding_indicator_array/*.test.cpp` | Padding indicator array generation |

### PCS Tests
| File | Description |
|------|-------------|
| `commitment_schemes/kzg/kzg.test.cpp` | KZG tests |
| `commitment_schemes/shplonk/shplonk.test.cpp` | Shplonk tests |
| `commitment_schemes/shplonk/shplemini.test.cpp` | Shplemini tests |
| `commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.test.cpp` | SmallSubgroupIPA tests |
| `commitment_schemes_recursion/shplemini.test.cpp` | Recursive Shplemini tests |
| `commitment_schemes_recursion/shplonk.test.cpp` | Recursive Shplonk tests |

### Native Verifier Tests
| File | Description |
|------|-------------|
| `chonk/chonk_verifier.test.cpp` | Native and recursive verifier correctness |
| `chonk/chonk_transcript_invariants.test.cpp` | Transcript consistency, tampering detection |
| `goblin/goblin_verifier.test.cpp` | Goblin verifier tests |
| `goblin/merge.test.cpp` | Merge protocol correctness, transcript pinning |
| `eccvm/eccvm.test.cpp` | ECCVM prover/verifier tests |
| `eccvm/eccvm_transcript.test.cpp` | ECCVM transcript tests |
| `translator_vm/translator.test.cpp` | Translator prover/verifier tests |
| `ultra_honk/ultra_transcript.test.cpp` | Ultra transcript manifest consistency |
| `ultra_honk/mega_transcript.test.cpp` | Mega transcript manifest consistency |

### In-Circuit (Recursive) Verifier Tests
| File | Description |
|------|-------------|
| `stdlib/honk_verifier/ultra_recursive_verifier.test.cpp` | Ultra recursive verifier tests |
| `stdlib/eccvm_verifier/eccvm_recursive_verifier.test.cpp` | ECCVM recursive verifier tests |
| `stdlib/eccvm_verifier/ecc_relation_consistency.test.cpp` | ECC relation consistency tests |
| `stdlib/eccvm_verifier/verifier_commitment_key.test.cpp` | Verifier commitment key tests |
| `stdlib/translator_vm_verifier/translator_recursive_verifier.test.cpp` | Translator recursive verifier tests |
| `commitment_schemes_recursion/ipa_recursive.test.cpp` | IPA recursive tests |

---

## Security Mechanisms

### Origin Tags
| File | Description |
|------|-------------|
| `transcript/origin_tag.hpp` | Origin tag tracking for Fiat-Shamir security |

### Boomerang Static Analyzer
| File | Description |
|------|-------------|
| `boomerang_value_detection/graph_description_ultra_recursive_verifier.test.cpp` | Ultra recursive verifier analysis |
| `boomerang_value_detection/graph_description_goblin.test.cpp` | Goblin recursive verifier analysis |
| `boomerang_value_detection/graph_description_merge_recursive_verifier.test.cpp` | Merge protocol recursive verifier analysis |
| `boomerang_value_detection/graph_description_ipa_recursive.test.cpp` | IPA recursive verification analysis |

### Fuzzers
| File | Description |
|------|-------------|
| `commitment_schemes/ipa/ipa.fuzzer.cpp` | IPA commitment scheme fuzzer |
| `eccvm/eccvm.fuzzer.cpp` | ECCVM execution fuzzer |
| `translator_vm/translator_circuit_builder.fuzzer.cpp` | Translator circuit builder fuzzer |
| `translator_vm/translator_composer.fuzzer.cpp` | Translator composer fuzzer |

---

## Documentation
- `sumcheck/Sumcheck.md` - In-depth sumcheck explainer
- `commitment_schemes/shplonk/README.md` - Shplonk/Shplemini documentation
- `commitment_schemes/gemini/README.md` - Gemini multilinear-to-univariate reduction
- `commitment_schemes/kzg/README.md` - KZG commitment scheme
- `commitment_schemes/small_subgroup_ipa/README.md` - SmallSubgroupIPA documentation
- `chonk/README.md` - Chonk architecture and verification flow
