# MultiChonk Migration Plan: Direct Replacement Approach

**Strategy**: Replace MegaFlavor with MultiMegaFlavor directly in Chonk (no templating)

**Rationale**:
- Multi Mega Prover is working and tested
- Performance comparison can be done via branch comparison
- Normal Mega will likely be deprecated
- Avoids templating complexity and code duplication

**Key Decision**: Hiding kernel will also use MultiMegaZK for consistency and full performance benefits

---

## Changes Required

### 0. Create MultiMegaZKFlavor (NEW - CRITICAL)

#### Change 0.1: Create MultiMegaZKFlavor Class
**New File**: `flavor/multi_mega_zk_flavor.hpp`

Based on `MegaZKFlavor`, but with:
- Interleaving: `INTERLEAVING_BATCH_SIZE = 4`, `INTERLEAVING_LOG_K = 2`
- 9 interleaved witness commitments (vs 24)
- 8 interleaved precomputed commitments (vs 31)
- ZK masking polynomials

**Structure**:
```cpp
#pragma once
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"

namespace bb {

/**
 * @brief MultiMegaZKFlavor: ZK version of MultiMegaFlavor with interleaved commitments
 * @details Combines:
 *   - Coefficient interleaving (batch=4) from MultiMegaFlavor
 *   - ZK masking from MegaZKFlavor
 *
 * Used for the hiding kernel in Chonk IVC.
 */
class MultiMegaZKFlavor : public MultiMegaFlavor {
  public:
    static constexpr bool HasZK = true;

    // Inherit interleaving parameters
    using MultiMegaFlavor::INTERLEAVING_BATCH_SIZE;
    using MultiMegaFlavor::INTERLEAVING_LOG_K;
    using MultiMegaFlavor::NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    using MultiMegaFlavor::NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS;

    // ZK-specific: Add masking polynomials
    // (Similar structure to MegaZKFlavor's ZK additions)
    // TODO: Determine exact ZK polynomial structure with interleaving

    // Prover type (needs MultiMegaZKProver)
    using Prover = MultiMegaZKProver;  // To be created

    // Recursive flavor
    template <typename Builder>
    using RecursiveFlavor = MultiMegaZKRecursiveFlavor_<Builder>;  // To be created
};

} // namespace bb
```

**Status**: Needs implementation (can be based on existing MegaZKFlavor + MultiMegaFlavor combination)

#### Change 0.2: Create MultiMegaZKProver
**New File**: `ultra_honk/multi_mega_zk_prover.hpp/cpp`

Based on `MultiMegaProver` but with ZK additions:
- Masking polynomials
- ZK-enhanced sumcheck
- ZK commitments

**Structure**:
```cpp
#pragma once
#include "barretenberg/ultra_honk/multi_mega_prover.hpp"
#include "barretenberg/ultra_honk/ultra_zk_prover.hpp"

namespace bb {

/**
 * @brief ZK version of MultiMegaProver with interleaved commitments
 */
class MultiMegaZKProver : public MultiMegaProver {
    using Flavor = MultiMegaZKFlavor;
    // Add ZK-specific logic (masking, etc.)
    // Similar to how UltraZKProver extends UltraProver
};

} // namespace bb
```

**Status**: Needs implementation

#### Change 0.3: Create MultiMegaZKVerifier
**New File**: `ultra_honk/multi_mega_zk_verifier.hpp/cpp`

Based on `MultiMegaVerifier` with ZK verification logic.

**Status**: Needs implementation

#### Change 0.4: Create MultiMegaZKRecursiveFlavor_
**New File**: `flavor/multi_mega_zk_recursive_flavor.hpp`

Recursive version for in-circuit verification of MultiMegaZK proofs.

**Status**: Needs implementation

---

### 1. Update Chonk Class Declaration (`chonk/chonk.hpp`)

#### Change 1.1: Flavor Type
**Line 42**:
```cpp
// Before:
using Flavor = MegaFlavor;

// After:
using Flavor = MultiMegaFlavor;
```

#### Change 1.2: ZK Flavor Type (CRITICAL UPDATE)
**Lines 44, 50**:
```cpp
// Before:
using MegaZKVerificationKey = MegaZKFlavor::VerificationKey;
using DeciderZKProvingKey = ProverInstance_<MegaZKFlavor>;

// After:
using MegaZKVerificationKey = MultiMegaZKFlavor::VerificationKey;
using DeciderZKProvingKey = ProverInstance_<MultiMegaZKFlavor>;
```

#### Change 1.3: Prover Type
**Line 55**:
```cpp
// Before:
using MegaProver = UltraProver_<Flavor>;

// After:
using MegaProver = MultiMegaProver;
```

#### Change 1.4: Recursive Flavor
**Line 58**:
```cpp
// Before:
using RecursiveFlavor = MegaRecursiveFlavor_<bb::MegaCircuitBuilder>;

// After:
using RecursiveFlavor = MultiMegaRecursiveFlavor_<bb::MegaCircuitBuilder>;
```

**Note**: `MultiMegaRecursiveFlavor_` needs to be created (for in-circuit HN/Oink verification)

#### Change 1.5: Include Headers
**Top of file**:
```cpp
// Add:
#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/flavor/multi_mega_zk_flavor.hpp"
#include "barretenberg/ultra_honk/multi_mega_prover.hpp"
#include "barretenberg/ultra_honk/multi_mega_zk_prover.hpp"
```

---

### 2. Update Chonk Implementation (`chonk/chonk.cpp`)

#### Change 2.1: Prover Instantiation (Non-ZK)
For Oink/HN proofs in `accumulate()`:
```cpp
// Before:
auto prover = UltraProver_<Flavor>(prover_instance, honk_vk);

// After:
auto prover = MultiMegaProver(prover_instance, honk_vk);
```

#### Change 2.2: ZK Prover Instantiation (Hiding Kernel)
In `prove()` method:
```cpp
// Before:
auto zk_prover = UltraProver_<MegaZKFlavor>(decider_proving_key, ...);

// After:
auto zk_prover = MultiMegaZKProver(decider_proving_key, ...);
```

---

### 3. Create Missing Components (Priority Order)

#### Priority 1: Core Non-ZK Components ✅ (Already Done)
- [x] MultiMegaFlavor
- [x] MultiMegaProver
- [x] MultiMegaVerifier

#### Priority 2: ZK Components (CRITICAL - To Do)
- [ ] **MultiMegaZKFlavor** - ZK flavor with interleaving
- [ ] **MultiMegaZKProver** - ZK prover with interleaving
- [ ] **MultiMegaZKVerifier** - ZK verifier with interleaving

#### Priority 3: Recursive Components (For In-Circuit Verification)
- [ ] **MultiMegaRecursiveFlavor_** - Recursive version of MultiMegaFlavor
- [ ] **MultiMegaZKRecursiveFlavor_** - Recursive version of MultiMegaZKFlavor

---

### 4. Implementation Strategy for ZK Components

#### Step 1: Understand Current ZK Structure
**Files to study**:
- `flavor/mega_zk_flavor.hpp` - ZK flavor definition
- `ultra_honk/ultra_zk_prover.hpp` - ZK prover implementation
- Compare with non-ZK versions to see what's added

**Key ZK additions** (from MegaZKFlavor):
- Masking polynomials (for hiding witness)
- Libra sumcheck (for ZK sumcheck)
- Additional commitments for masking
- Padding indicator polynomials

#### Step 2: Create MultiMegaZKFlavor
**Approach**: Combine MultiMegaFlavor structure with MegaZKFlavor ZK additions

**Structure**:
```cpp
class MultiMegaZKFlavor : public MultiMegaFlavor {
  public:
    static constexpr bool HasZK = true;

    // Inherit interleaving from MultiMegaFlavor
    using MultiMegaFlavor::INTERLEAVING_BATCH_SIZE;
    using MultiMegaFlavor::InterleavedCommitments;
    using MultiMegaFlavor::InterleavedPrecomputed;

    // Add ZK-specific from MegaZKFlavor
    static constexpr size_t NUM_LIBRA_COMMITMENTS = /*...*/;

    // ZK polynomial additions
    // - Libra commitments
    // - Masking polynomials
    // - etc.
};
```

#### Step 3: Create MultiMegaZKProver
**Approach**: Extend MultiMegaProver with ZK logic from UltraZKProver

**Key additions**:
- Generate masking polynomials
- Commit to Libra polynomials (interleaved)
- Run ZK-enhanced sumcheck
- Handle ZK-specific Shplemini modifications

#### Step 4: Create MultiMegaZKVerifier
**Approach**: Extend MultiMegaVerifier with ZK verification

**Key additions**:
- Receive Libra commitments
- Verify ZK sumcheck
- Verify masking is correct

---

### 5. Create Recursive Flavors

#### MultiMegaRecursiveFlavor_
**File**: `flavor/multi_mega_recursive_flavor.hpp`

```cpp
template <typename BuilderType>
class MultiMegaRecursiveFlavor_ : public MegaRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = MultiMegaFlavor;

    // Inherit interleaving parameters
    static constexpr size_t INTERLEAVING_BATCH_SIZE = 4;
    static constexpr size_t INTERLEAVING_LOG_K = 2;

    // Interleaved commitments (circuit types)
    using InterleavedCommitments = /*...circuit commitment types...*/;

    // Update verifier to handle Lagrange basis evaluation batching
    // Verifier needs to:
    // 1. Receive individual polynomial evaluations from sumcheck
    // 2. Compute Lagrange basis L_j(u_0, u_1)
    // 3. Batch: F(u) = Σ f_j(u) · L_j(u_0, u_1)
};
```

#### MultiMegaZKRecursiveFlavor_
**File**: `flavor/multi_mega_zk_recursive_flavor.hpp`

Similar to above but with ZK additions.

---

### 6. Testing Strategy

#### Phase 1: ZK Components Standalone
```cpp
TEST(MultiMegaZK, ProverVerifierConsistency) {
    MegaCircuitBuilder builder;
    // ... build circuit ...

    auto instance = std::make_shared<ProverInstance_<MultiMegaZKFlavor>>(builder);
    auto vk = std::make_shared<MultiMegaZKFlavor::VerificationKey>(instance->get_precomputed());

    MultiMegaZKProver prover(instance, vk);
    auto proof = prover.construct_proof();

    MultiMegaZKVerifier verifier(vk);
    bool verified = verifier.verify_proof(proof);
    EXPECT_TRUE(verified);
}
```

#### Phase 2: Chonk Integration
```cpp
TEST(MultiChonk, WithZKHidingKernel) {
    Chonk chonk(2);
    // ... accumulate circuits ...
    auto proof = chonk.prove();  // Uses MultiMegaZKProver for hiding kernel
    // ... verify proof ...
}
```

#### Phase 3: Full IVC
```bash
yarn-project/scripts/run_test.sh ivc-integration/src/native_chonk_integration.test.ts
```

---

### 7. Update Proof Length Constants

With MultiMegaZK for hiding kernel:
- Hiding kernel proof: 17 commitments (8 precomputed + 9 witness) + Libra commitments
- Gemini rounds: log(n) + 2 (k=2)

**Files to update**:
- `honk/proof_length.hpp`
- `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr`
- `dsl/acir_format/mock_verifier_inputs.test.cpp`

---

## Implementation Checklist

### Phase 0: Create ZK Components (CRITICAL - Do First) ✅
- [ ] Study MegaZKFlavor structure and ZK additions
- [ ] Create `MultiMegaZKFlavor` class
- [ ] Create `MultiMegaZKProver` class
- [ ] Create `MultiMegaZKVerifier` class
- [ ] Test standalone: prover/verifier consistency

### Phase 1: Create Recursive Flavors ✅
- [ ] Create `MultiMegaRecursiveFlavor_<Builder>`
- [ ] Create `MultiMegaZKRecursiveFlavor_<Builder>`
- [ ] Test recursive verifier with simple circuit

### Phase 2: Update Chonk ✅
- [ ] Update `Flavor` to `MultiMegaFlavor` in `chonk.hpp`
- [ ] Update ZK types to `MultiMegaZKFlavor`
- [ ] Update `MegaProver` to `MultiMegaProver`
- [ ] Update `RecursiveFlavor` to `MultiMegaRecursiveFlavor_`
- [ ] Update includes

### Phase 3: Update Implementation ✅
- [ ] Update prover instantiations in `chonk.cpp`
- [ ] Update ZK prover instantiation for hiding kernel
- [ ] Verify commitment key sizing

### Phase 4: Testing ✅
- [ ] Compile and fix errors
- [ ] Run minimal Chonk instantiation test
- [ ] Run single circuit accumulation test
- [ ] Run VK consistency test and update VKs
- [ ] Update proof length constants
- [ ] Run full IVC integration tests

### Phase 5: Performance Validation ✅
- [ ] Benchmark ECCVM operations (expect ~71% reduction)
- [ ] Measure proof sizes (expect ~54% reduction)
- [ ] Compare IVC proving time
- [ ] Verify memory usage acceptable

---

## Expected File Structure

```
barretenberg/cpp/src/barretenberg/
├── flavor/
│   ├── multi_mega_flavor.hpp              [✅ Exists]
│   ├── multi_mega_zk_flavor.hpp           [⏳ TO CREATE]
│   ├── multi_mega_recursive_flavor.hpp    [⏳ TO CREATE]
│   └── multi_mega_zk_recursive_flavor.hpp [⏳ TO CREATE]
├── ultra_honk/
│   ├── multi_mega_prover.hpp/cpp          [✅ Exists]
│   ├── multi_mega_verifier.hpp/cpp        [✅ Exists]
│   ├── multi_mega_oink_prover.hpp/cpp     [✅ Exists]
│   ├── multi_mega_oink_verifier.hpp/cpp   [✅ Exists]
│   ├── multi_mega_zk_prover.hpp/cpp       [⏳ TO CREATE]
│   └── multi_mega_zk_verifier.hpp/cpp     [⏳ TO CREATE]
└── chonk/
    ├── chonk.hpp                           [🔧 TO UPDATE]
    ├── chonk.cpp                           [🔧 TO UPDATE]
    └── multichonk_migration_plan.md        [📋 This file]
```

---

## Open Questions

### Q1: How do ZK masking polynomials interact with interleaving?
**Options**:
1. Mask individual polynomials before interleaving
2. Mask interleaved polynomials after construction
3. Interleave masking polynomials separately

**Action**: Study MegaZKFlavor implementation and adapt for interleaving

### Q2: Should Libra commitments also be interleaved?
**Consideration**: Libra polynomials are used for ZK sumcheck masking
- **Pro (interleave)**: Consistency, fewer commitments
- **Con (separate)**: Simpler, Libra structure may not fit batching constraints

**Action**: Review Libra structure and decide

### Q3: Do we need MultiMegaZKRecursiveFlavor immediately?
**Context**: Recursive verifier for hiding kernel proof
- Hiding kernel is only verified natively (on L1), not recursively
- So MultiMegaZKRecursiveFlavor may not be needed initially

**Action**: Confirm hiding kernel is never verified in-circuit, defer if not needed

---

## Success Criteria

✅ MultiMegaZKFlavor defined with interleaving + ZK
✅ MultiMegaZKProver generates valid proofs
✅ MultiMegaZKVerifier verifies proofs correctly
✅ Chonk compiles with MultiMegaFlavor + MultiMegaZKFlavor
✅ Full IVC test passes with ZK hiding kernel
✅ Proof size reduced by ~54%
✅ ECCVM operations reduced by ~71%
✅ VKs updated and consistent

---

## Timeline Estimate

| Phase | Task | Effort | Dependencies |
|-------|------|--------|--------------|
| 0 | Study MegaZKFlavor | 0.5 day | - |
| 0 | Create MultiMegaZKFlavor | 1 day | Study complete |
| 0 | Create MultiMegaZKProver | 1 day | Flavor done |
| 0 | Create MultiMegaZKVerifier | 1 day | Prover done |
| 0 | Test ZK components | 0.5 day | All ZK done |
| 1 | Create recursive flavors | 1 day | ZK components done |
| 2 | Update Chonk types | 0.5 day | Recursive flavors |
| 3 | Update implementation | 0.5 day | Types updated |
| 4 | Testing & debugging | 1-2 days | Implementation done |
| 5 | Performance validation | 0.5 day | Tests passing |

**Total**: ~7-8 days

---

## Next Steps

1. **Study MegaZKFlavor** - Understand ZK additions (masking, Libra, etc.)
2. **Create MultiMegaZKFlavor** - Combine interleaving with ZK
3. **Create MultiMegaZKProver/Verifier** - Implement ZK proving with interleaving
4. **Test ZK components standalone** - Ensure they work before Chonk integration
5. **Create recursive flavors** - For in-circuit verification
6. **Update Chonk** - Switch to MultiMega flavors
7. **Full integration testing** - Verify everything works end-to-end
