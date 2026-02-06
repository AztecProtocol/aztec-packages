# Chonk Templating Plan: Supporting Both MegaFlavor and MultiMegaFlavor

**Goal**: Template the Chonk class to support both `MegaFlavor` and `MultiMegaFlavor` simultaneously, enabling gradual rollout, performance comparison, and easy fallback.

---

## Overview of Changes

The Chonk class currently hardcodes `using Flavor = MegaFlavor;` at line 42 of `chonk.hpp`. To support both flavors:

1. **Template the Chonk class** on `FlavorType`
2. **Update type aliases** to derive from the template parameter
3. **Specialize the prover type** (UltraProver vs MultiMegaProver)
4. **Create type aliases** for convenience (Chonk = Chonk_<MegaFlavor>, MultiChonk = Chonk_<MultiMegaFlavor>)
5. **Update recursive flavor mapping** to handle both flavors

---

## Detailed Changes

### 1. Class Declaration

**Current** (`chonk.hpp:38`):
```cpp
class Chonk : public IVCBase {
  public:
    using Flavor = MegaFlavor;
    // ... all type aliases derived from Flavor
```

**New**:
```cpp
template <typename FlavorType> class Chonk_ : public IVCBase {
  public:
    using Flavor = FlavorType;
    // ... all type aliases automatically work through template parameter
```

### 2. Type Aliases That Need Updates

#### 2.1 Straightforward (Automatically Derive from Flavor)

These aliases automatically work when we template on Flavor:

```cpp
using MegaVerificationKey = Flavor::VerificationKey;
using FF = Flavor::FF;
using Commitment = Flavor::Commitment;
using ProverPolynomials = Flavor::ProverPolynomials;
using Point = Flavor::Curve::AffineElement;
using ProverInstance = ProverInstance_<Flavor>;
using VerifierInstance = VerifierInstance_<Flavor>;
using Transcript = NativeTranscript;
```

#### 2.2 Prover Type (Needs Specialization)

**Issue**: Different prover classes for different flavors
- MegaFlavor → UltraProver_<MegaFlavor>
- MultiMegaFlavor → MultiMegaProver

**Solution**: Use trait or conditional type

**Option A: Trait-based (Recommended)**
```cpp
// In flavor headers, define prover type
// mega_flavor.hpp:
class MegaFlavor : ... {
    using Prover = UltraProver_<MegaFlavor>;
};

// multi_mega_flavor.hpp:
class MultiMegaFlavor : ... {
    using Prover = MultiMegaProver;
};

// In chonk.hpp:
template <typename FlavorType> class Chonk_ : public IVCBase {
  public:
    using Flavor = FlavorType;
    using MegaProver = typename Flavor::Prover; // Now derives from flavor
```

**Option B: Conditional type**
```cpp
template <typename FlavorType> class Chonk_ : public IVCBase {
  public:
    using Flavor = FlavorType;
    using MegaProver = std::conditional_t<
        std::is_same_v<Flavor, MultiMegaFlavor>,
        MultiMegaProver,
        UltraProver_<Flavor>
    >;
```

**Recommendation**: Option A (trait-based) is cleaner and more extensible.

#### 2.3 Recursive Flavor (Needs Mapping)

**Current**:
```cpp
using RecursiveFlavor = MegaRecursiveFlavor_<bb::MegaCircuitBuilder>;
```

**Issue**: Need to map native flavor → recursive flavor
- MegaFlavor → MegaRecursiveFlavor_<Builder>
- MultiMegaFlavor → MultiMegaRecursiveFlavor_<Builder> (needs creation)

**Solution**: Define recursive flavor in each native flavor

**mega_flavor.hpp**:
```cpp
class MegaFlavor : ... {
    template <typename Builder>
    using RecursiveFlavor = MegaRecursiveFlavor_<Builder>;
};
```

**multi_mega_flavor.hpp**:
```cpp
class MultiMegaFlavor : ... {
    template <typename Builder>
    using RecursiveFlavor = MultiMegaRecursiveFlavor_<Builder>;
};
```

**chonk.hpp**:
```cpp
template <typename FlavorType> class Chonk_ : public IVCBase {
  public:
    using Flavor = FlavorType;
    using ClientCircuit = MegaCircuitBuilder; // same for both
    using RecursiveFlavor = typename Flavor::template RecursiveFlavor<ClientCircuit>;
    using StdlibFF = RecursiveFlavor::FF;
    using RecursiveCommitment = RecursiveFlavor::Commitment;
    // ... etc
```

#### 2.4 ZK Flavor (Special Case)

**Current**:
```cpp
using DeciderZKProvingKey = ProverInstance_<MegaZKFlavor>;
using MegaZKVerificationKey = MegaZKFlavor::VerificationKey;
```

**Issue**: The hiding kernel always uses ZK, regardless of base flavor

**Options**:
1. **Always use MegaZKFlavor** (current approach, simple)
2. **Create MultiMegaZKFlavor** (if hiding kernel should also use interleaving)

**Decision needed**: Should the hiding kernel use interleaved commitments?
- **Pro (MultiMegaZKFlavor)**: Consistent with base flavor, potential savings
- **Con (MultiMegaZKFlavor)**: Additional complexity, hiding kernel is not on critical path

**Recommendation for now**: Keep using MegaZKFlavor (unchanged), revisit later if needed.

```cpp
template <typename FlavorType> class Chonk_ : public IVCBase {
  public:
    using Flavor = FlavorType;
    // Hiding kernel always uses MegaZK (not templated)
    using DeciderZKProvingKey = ProverInstance_<MegaZKFlavor>;
    using MegaZKVerificationKey = MegaZKFlavor::VerificationKey;
```

#### 2.5 Circuit Builder Type

**Current**:
```cpp
using ClientCircuit = MegaCircuitBuilder; // can only be Mega
```

**Analysis**: Both MegaFlavor and MultiMegaFlavor use MegaCircuitBuilder.

**Conclusion**: No change needed, remains hardcoded.

```cpp
using ClientCircuit = MegaCircuitBuilder; // same for both flavors
```

#### 2.6 Commitment Key

**Current** (`chonk.hpp:158`):
```cpp
typename MegaFlavor::CommitmentKey bn254_commitment_key;
```

**New**:
```cpp
typename Flavor::CommitmentKey bn254_commitment_key;
```

**Note**: MultiMegaFlavor's CommitmentKey needs to be initialized to 4n size (already handled in MultiMegaProver).

### 3. Functions That Need Template Updates

Most functions don't need changes since they use type aliases. However, some may need attention:

#### 3.1 Constructor

**Current** (`chonk.hpp:168`):
```cpp
Chonk(size_t num_circuits);
```

**New**:
```cpp
template <typename FlavorType>
Chonk_<FlavorType>::Chonk_(size_t num_circuits) { ... }
```

#### 3.2 accumulate()

**Current**:
```cpp
void accumulate(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk) override;
```

**Note**: Uses `MegaVerificationKey` type alias which now derives from `Flavor::VerificationKey`.

**No change needed** in signature, but implementation may need updates if prover instantiation differs.

#### 3.3 prove()

**Current**:
```cpp
ChonkProof prove();
```

**Analysis**: Uses MegaZKFlavor for hiding kernel prover, which we decided to keep unchanged.

**Likely no changes needed**, but verify prover instantiation in implementation.

### 4. Data Members That Need Updates

#### 4.1 Verification Queue

**Current** (`chonk.hpp:108-114`):
```cpp
struct VerifierInputs {
    std::vector<FF> proof;
    std::shared_ptr<MegaVerificationKey> honk_vk;
    QUEUE_TYPE type;
    bool is_kernel = false;
};
using VerificationQueue = std::deque<VerifierInputs>;
```

**Analysis**: `MegaVerificationKey` is a type alias that now derives from `Flavor::VerificationKey`.

**No change needed** — automatically works with template.

### 5. Files That Need Updates

| File | Changes Required |
|------|------------------|
| `chonk/chonk.hpp` | Template class declaration, update type aliases |
| `chonk/chonk.cpp` | Template function definitions, move to header or keep in .cpp with explicit instantiations |
| `chonk/chonk_base.hpp` | May need `IVCBase` to be templated or type-erased |
| `flavor/mega_flavor.hpp` | Add `using Prover = UltraProver_<MegaFlavor>;` |
| `flavor/multi_mega_flavor.hpp` | Add `using Prover = MultiMegaProver;` |
| `flavor/mega_flavor.hpp` | Add `template<typename B> using RecursiveFlavor = MegaRecursiveFlavor_<B>;` |
| `flavor/multi_mega_flavor.hpp` | Create MultiMegaRecursiveFlavor_, add typedef |
| `ultra_honk/multi_mega_prover.hpp` | Ensure it's compatible with Chonk's expectations |

---

## Implementation Strategy

### Phase 1: Add Prover and RecursiveFlavor to Flavors

**File: `flavor/mega_flavor.hpp`**
```cpp
class MegaFlavor : public ... {
  public:
    // ... existing members ...

    // Prover type for this flavor
    using Prover = UltraProver_<MegaFlavor>;

    // Recursive flavor mapping
    template <typename Builder>
    using RecursiveFlavor = MegaRecursiveFlavor_<Builder>;
};
```

**File: `flavor/multi_mega_flavor.hpp`**
```cpp
class MultiMegaFlavor : public MegaFlavor {
  public:
    // ... existing members ...

    // Prover type for this flavor (specialized)
    using Prover = MultiMegaProver;

    // Recursive flavor mapping
    template <typename Builder>
    using RecursiveFlavor = MultiMegaRecursiveFlavor_<Builder>;
};
```

### Phase 2: Create MultiMegaRecursiveFlavor_

**File: `flavor/multi_mega_recursive_flavor.hpp`** (new file)
```cpp
#pragma once
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"

namespace bb {

/**
 * @brief Recursive counterpart to MultiMegaFlavor with interleaved commitments.
 * @details Similar to MegaRecursiveFlavor but with:
 *   - 9 interleaved witness commitments (vs 24 individual)
 *   - 8 interleaved precomputed commitments (vs 31 individual)
 *   - Lagrange basis evaluation batching in verifier
 */
template <typename BuilderType>
class MultiMegaRecursiveFlavor_ : public MegaRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = MultiMegaFlavor;

    static constexpr size_t INTERLEAVING_BATCH_SIZE = MultiMegaFlavor::INTERLEAVING_BATCH_SIZE;
    static constexpr size_t INTERLEAVING_LOG_K = MultiMegaFlavor::INTERLEAVING_LOG_K;

    // Import interleaved commitment structures
    using InterleavedCommitments = typename MultiMegaFlavor::template InterleavedWitnessCommitments<Commitment>;
    using InterleavedPrecomputed = typename MultiMegaFlavor::template InterleavedPrecomputedCommitments<Commitment>;

    // ... other members as needed for recursive verification ...
};

} // namespace bb
```

### Phase 3: Template the Chonk Class

**File: `chonk/chonk.hpp`** (header)
```cpp
#pragma once
// ... includes ...
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"

namespace bb {

/**
 * @brief Templated IVC scheme supporting different proving flavors.
 * @tparam FlavorType The proving flavor (MegaFlavor or MultiMegaFlavor)
 */
template <typename FlavorType>
class Chonk_ : public IVCBase {
  public:
    using Flavor = FlavorType;
    using MegaVerificationKey = typename Flavor::VerificationKey;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using Point = typename Flavor::Curve::AffineElement;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using ClientCircuit = MegaCircuitBuilder;
    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;

    // Prover type from flavor
    using MegaProver = typename Flavor::Prover;

    using Transcript = NativeTranscript;

    // Recursive types
    using RecursiveFlavor = typename Flavor::template RecursiveFlavor<ClientCircuit>;
    using StdlibFF = typename RecursiveFlavor::FF;
    using RecursiveCommitment = typename RecursiveFlavor::Commitment;
    using RecursiveVerifierInstance = VerifierInstance_<RecursiveFlavor>;
    using RecursiveVerificationKey = typename RecursiveFlavor::VerificationKey;
    using RecursiveVKAndHash = typename RecursiveFlavor::VKAndHash;
    using RecursiveTranscript = typename RecursiveFlavor::Transcript;
    using PairingPoints = stdlib::recursion::PairingPoints<stdlib::bn254<ClientCircuit>>;
    using KernelIO = bb::stdlib::recursion::honk::KernelIO;
    using HidingKernelIO = bb::stdlib::recursion::honk::HidingKernelIO<ClientCircuit>;
    using AppIO = bb::stdlib::recursion::honk::AppIO;
    using StdlibProof = stdlib::Proof<ClientCircuit>;
    using WitnessCommitments = typename RecursiveFlavor::WitnessCommitments;
    using DataBusDepot = stdlib::DataBusDepot<ClientCircuit>;
    using TableCommitments = std::array<typename RecursiveFlavor::Commitment, ClientCircuit::NUM_WIRES>;

    // Folding (uses base Flavor)
    using FoldingProver = HypernovaFoldingProver;
    using FoldingVerifier = HypernovaFoldingVerifier<Flavor>;
    using RecursiveFoldingVerifier = HypernovaFoldingVerifier<RecursiveFlavor>;
    using DeciderProver = HypernovaDeciderProver;
    using RecursiveDeciderVerifier = HypernovaDeciderVerifier<RecursiveFlavor>;
    using ProverAccumulator = typename FoldingProver::Accumulator;
    using VerifierAccumulator = typename FoldingVerifier::Accumulator;
    using RecursiveVerifierAccumulator = typename RecursiveFoldingVerifier::Accumulator;

    // Hiding kernel always uses MegaZK (unchanged)
    using DeciderZKProvingKey = ProverInstance_<MegaZKFlavor>;
    using MegaZKVerificationKey = MegaZKFlavor::VerificationKey;

    // ... rest of class definition (same as before) ...

    enum class QUEUE_TYPE : uint8_t { OINK, HN, HN_TAIL, HN_FINAL, MEGA };

    struct VerifierInputs {
        std::vector<FF> proof;
        std::shared_ptr<MegaVerificationKey> honk_vk;
        QUEUE_TYPE type;
        bool is_kernel = false;
    };
    using VerificationQueue = std::deque<VerifierInputs>;

    struct StdlibVerifierInputs {
        StdlibProof proof;
        std::shared_ptr<RecursiveVKAndHash> honk_vk_and_hash;
        QUEUE_TYPE type;
        bool is_kernel = false;
    };
    using StdlibVerificationQueue = std::deque<StdlibVerifierInputs>;

  private:
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();
    std::shared_ptr<Transcript> prover_accumulation_transcript = std::make_shared<Transcript>();
    size_t num_circuits;

  public:
    size_t num_circuits_accumulated = 0;
    ProverAccumulator prover_accumulator;
    HonkProof decider_proof;
    VerifierAccumulator recursive_verifier_native_accum;

    #ifndef NDEBUG
    VerifierAccumulator native_verifier_accum;
    FF native_verifier_accum_hash;
    bool is_previous_circuit_a_kernel = true;
    bool has_last_app_been_accumulated = false;
    #endif

    VerificationQueue verification_queue;
    StdlibVerificationQueue stdlib_verification_queue;
    DataBusDepot bus_depot;

    typename Flavor::CommitmentKey bn254_commitment_key;

    Goblin goblin;

    size_t get_num_circuits() const { return num_circuits; }
    Goblin& get_goblin() override { return goblin; }
    const Goblin& get_goblin() const override { return goblin; }

    Chonk_(size_t num_circuits);

    void instantiate_stdlib_verification_queue(
        ClientCircuit& circuit,
        const std::vector<std::shared_ptr<RecursiveVKAndHash>>& input_keys = {});

    [[nodiscard("Pairing points should be accumulated")]]
    std::tuple<std::optional<RecursiveVerifierAccumulator>, std::vector<PairingPoints>, TableCommitments>
    perform_recursive_verification_and_databus_consistency_checks(
        ClientCircuit& circuit,
        const StdlibVerifierInputs& verifier_inputs,
        const std::optional<RecursiveVerifierAccumulator>& input_verifier_accumulator,
        const TableCommitments& T_prev_commitments,
        const std::shared_ptr<RecursiveTranscript>& accumulation_recursive_transcript);

    void complete_kernel_circuit_logic(ClientCircuit& circuit);

    void accumulate(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk) override;

    ChonkProof prove();

    static void hide_op_queue_accumulation_result(ClientCircuit& circuit);
    static void hide_op_queue_content_in_tail(ClientCircuit& circuit);
    static void hide_op_queue_content_in_hiding(ClientCircuit& circuit);

    // ... rest of methods ...
};

// Convenience aliases
using Chonk = Chonk_<MegaFlavor>;
using MultiChonk = Chonk_<MultiMegaFlavor>;

} // namespace bb
```

### Phase 4: Update Implementation File

**File: `chonk/chonk.cpp`**

**Option A**: Keep implementations in .cpp with explicit instantiations at end:
```cpp
// ... all implementations ...

// Explicit instantiations
template class bb::Chonk_<bb::MegaFlavor>;
template class bb::Chonk_<bb::MultiMegaFlavor>;
```

**Option B**: Move all implementations to header (inline or in separate .tpp file)
- Simpler but increases compile times
- Recommended if implementations are small

### Phase 5: Update IVCBase

**File: `chonk/chonk_base.hpp`**

Check if `IVCBase::accumulate()` needs to be made flavor-agnostic:

**Current**:
```cpp
class IVCBase {
  public:
    virtual void accumulate(MegaCircuitBuilder& circuit,
                           const std::shared_ptr<MegaFlavor::VerificationKey>& vk) = 0;
```

**Issue**: Signature is flavor-specific.

**Solution**: Make it generic or template-based
```cpp
class IVCBase {
  public:
    virtual void accumulate(MegaCircuitBuilder& circuit,
                           const std::shared_ptr<VerificationKeyBase>& vk) = 0;
    // OR: Use type erasure with std::any
    // OR: Keep flavor-specific and remove from base class
```

**Recommendation**: Remove from base class if it's the only virtual method, or use type erasure.

---

## Testing Strategy

### 1. Compile-Time Tests
```cpp
// Verify both instantiations compile
static_assert(sizeof(Chonk_<MegaFlavor>) > 0);
static_assert(sizeof(Chonk_<MultiMegaFlavor>) > 0);

// Verify type aliases resolve correctly
static_assert(std::is_same_v<Chonk::Flavor, MegaFlavor>);
static_assert(std::is_same_v<MultiChonk::Flavor, MultiMegaFlavor>);
static_assert(std::is_same_v<Chonk::MegaProver, UltraProver_<MegaFlavor>>);
static_assert(std::is_same_v<MultiChonk::MegaProver, MultiMegaProver>);
```

### 2. Unit Tests
```cpp
TEST(ChonkTemplating, BothFlavorsInstantiate) {
    // Test with MegaFlavor (existing)
    Chonk chonk(2);
    EXPECT_EQ(chonk.get_num_circuits(), 2);

    // Test with MultiMegaFlavor (new)
    MultiChonk multi_chonk(2);
    EXPECT_EQ(multi_chonk.get_num_circuits(), 2);
}
```

### 3. Integration Tests
```cpp
TEST(ChonkTemplating, MegaFlavorIntegration) {
    Chonk chonk(2);
    // ... existing IVC test ...
}

TEST(ChonkTemplating, MultiMegaFlavorIntegration) {
    MultiChonk multi_chonk(2);
    // ... same IVC test with MultiMega ...
}
```

### 4. Performance Comparison
```cpp
void benchmark_both_flavors() {
    // Run same workload with both flavors
    auto mega_time = benchmark_ivc<MegaFlavor>();
    auto multi_mega_time = benchmark_ivc<MultiMegaFlavor>();

    info("MegaFlavor time: ", mega_time);
    info("MultiMegaFlavor time: ", multi_mega_time);
    info("Speedup: ", mega_time / multi_mega_time);
}
```

---

## Migration Path

### Step 1: Add traits to flavors (non-breaking)
- Add `Prover` and `RecursiveFlavor` to MegaFlavor
- Add `Prover` and `RecursiveFlavor` to MultiMegaFlavor
- Create MultiMegaRecursiveFlavor_

### Step 2: Template Chonk (breaking)
- Rename `Chonk` → `Chonk_<FlavorType>`
- Add convenience alias: `using Chonk = Chonk_<MegaFlavor>;`
- Update all callers to use `Chonk` (unchanged for existing code)

### Step 3: Explicit instantiation
- Add explicit template instantiations for both flavors
- Verify both compile and link correctly

### Step 4: Testing
- Run existing tests with `Chonk` (should pass unchanged)
- Add new tests with `MultiChonk`
- Compare performance

---

## Backwards Compatibility

**Goal**: Existing code using `Chonk` should continue to work unchanged.

**Solution**: Provide default alias
```cpp
using Chonk = Chonk_<MegaFlavor>;  // Default to existing behavior
```

**Usage**:
```cpp
// Existing code (unchanged)
Chonk chonk(num_circuits);

// New code with MultiMega
MultiChonk multi_chonk(num_circuits);

// Or explicit template
Chonk_<MultiMegaFlavor> multi_chonk(num_circuits);
```

---

## Summary of Required Changes

| Component | Change | Difficulty |
|-----------|--------|------------|
| MegaFlavor | Add `Prover` and `RecursiveFlavor` type aliases | Low |
| MultiMegaFlavor | Add `Prover` and `RecursiveFlavor` type aliases | Low |
| MultiMegaRecursiveFlavor_ | Create new recursive flavor class | Medium |
| Chonk class | Template on FlavorType | Medium |
| Chonk implementation | Update or add explicit instantiations | Medium |
| IVCBase | Remove or make flavor-agnostic | Low-Medium |
| Tests | Add tests for both flavors | Medium |

**Total Estimated Effort**: ~2-3 days for implementation + testing

---

## Open Questions

1. **Should hiding kernel use MultiMegaZKFlavor?**
   - Currently: Always use MegaZKFlavor (simple, consistent)
   - Alternative: Create MultiMegaZKFlavor (more savings, more complexity)
   - **Recommendation**: Keep MegaZKFlavor for now, revisit if needed

2. **Should IVCBase remain flavor-specific?**
   - Currently: Has flavor-specific virtual method
   - Options: Type erasure, remove from base, or make base templated
   - **Recommendation**: Remove `accumulate()` from base class (only used by Chonk)

3. **Should Chonk implementation stay in .cpp?**
   - Pro: Faster compile times, smaller header
   - Con: Need explicit instantiations, can't template on arbitrary flavors
   - **Recommendation**: Keep in .cpp with explicit instantiations (only 2 flavors needed)
