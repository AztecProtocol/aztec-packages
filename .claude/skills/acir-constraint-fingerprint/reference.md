# ACIR Constraint Fingerprint — Reference Templates

## File placement for new constraint family

```
barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/
├── recursion_constraints_helper.hpp     # generic FP (existing)
├── hypernova_verification.hpp           # HN constants (existing)
├── boomerang_<family>_recursion.test.cpp
└── (optional future) <family>_acir_test_helpers.hpp   # when 3+ tests share setup
```

Extract to `*_acir_test_helpers.hpp` when the same `make_*_acir_setup` is used from 3+ tests.

---

## Template: new HN variant

```cpp
// ── In boomerang_hn_recursion.test.cpp (or hn_acir_test_helpers.hpp) ──

static HNAcirSetup make_hn_<variant>_acir_setup()
{
    return make_hn_acir_setup(Chonk::QUEUE_TYPE::<TYPE>, /*is_kernel=*/false);
}

static HNBuilder build_hn_<variant>_kernel_circuit()
{
    return build_hn_circuit_from_acir(make_hn_<variant>_acir_setup());
}

// Step 3
TEST_F(HNRecursionTestSuite, AcirHN<Variant>Compiles)
{
    BB_DISABLE_ASSERTS();
    EXPECT_GT(build_hn_<variant>_kernel_circuit().get_num_finalized_gates(), 0UL);
}

// Step 5 — full-circuit stage dump (squeeze-anchored)
TEST_F(HNRecursionTestSuite, HN<Variant>FingerPrintDump)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_hn_<variant>_kernel_circuit();
    HNAnalyzer analyzer(builder, false);
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    std::ofstream out("hn_<variant>_functions_analysis.txt");
    ASSERT_TRUE(out.is_open());

    write_hn_arith_poseidon_stage(out, builder, analyzer,
        "HN:<Variant>:oink_pre_eta", 0, sq[HNVerification::HN_SQUEEZE_OINK_ETA] + 1);
    // ... more stages ...

    SUCCEED();
}
```

---

## Template: step-by-step OINK dump (path B + C)

```cpp
struct HNOinkExecutionContext {
    std::shared_ptr<HNOinkTranscript> transcript;
    std::shared_ptr<HNOinkVerifierInstance> verifier_instance;
    size_t num_public_inputs = 0;
};

static HNOinkExecutionContext build_hn_init_oink_context(HNBuilder& builder, const HNAcirSetup& setup)
{
    const auto& constraint = setup.hn_constraint(0);
    const auto& entry = setup.ivc->verification_queue.front();

    auto key_fields = fields_from_witnesses(builder, constraint.key);
    auto recursive_vk = std::make_shared<HNOinkVerificationKey>(key_fields);
    auto vk_hash_ct = HNOinkField::from_witness_index(&builder, constraint.key_hash);
    auto vk_and_hash = std::make_shared<HNOinkVKAndHash>(recursive_vk, vk_hash_ct);

    stdlib::Proof<HNBuilder> stdlib_proof(builder, entry.proof);
    HNOinkExecutionContext ctx;
    ctx.transcript = std::make_shared<HNOinkTranscript>();
    ctx.transcript->load_proof(stdlib_proof);
    ctx.verifier_instance = std::make_shared<HNOinkVerifierInstance>(vk_and_hash);
    ctx.num_public_inputs = ProofLength::HypernovaInstanceToAccum<HNOinkRecursiveFlavor>::
        derive_num_public_inputs(entry.proof.size(), HNOinkRecursiveFlavor::VIRTUAL_LOG_N);
    return ctx;
}

TEST_F(HNRecursionTestSuite, HNInitFingerPrintDump)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_witness_builder(setup);
    auto ctx = build_hn_init_oink_context(builder, setup);

    std::ofstream out("hn_oink_functions_analysis.txt");
    ASSERT_TRUE(out.is_open());
    hn_execute_oink_part(builder, ctx, out);
    SUCCEED();
}
```

---

## Template: non-recursion DSL constraint (poseidon / sha256 pattern)

```cpp
// Existing pattern in boomerang_poseidon2_constraints.test.cpp:
AcirFormat constraint_system = /* build constraint */;
WitnessVector witness = /* ... */;
AcirProgram program{ constraint_system, witness };

UltraCircuitBuilder builder = create_circuit<UltraCircuitBuilder>(program, {});

// Dump: compute FP on builder.blocks.arithmetic range for the opcode window
```

For new DSL opcode: copy nearest boomerang_*_constraints.test.cpp, replace constraint construction only.

---

## Template: print_fp output line

Dump tests emit paste-ready constants:

```cpp
static void print_fp(std::ostream& out, const char* name, const FunctionFingerprint& fp)
{
    out << std::dec << "inline constexpr FunctionFingerprint " << name << " = { "
        << fp.gate_count << ", 0x" << std::hex << fp.prefix_hash << "ULL, 0x"
        << fp.full_hash << "ULL, " << std::dec << fp.fingerprint_size << " };\n";
}
```

Example consumer test:

```cpp
TEST_F(HNRecursionTestSuite, AcirHNInitFingerprintsMatchConstants)
{
    BB_DISABLE_ASSERTS();
    auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    AcirFormat cs_copy = setup.program.constraints;
    cdg::MegaStaticAnalyzerAcir analyzer(std::move(cs_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}
```

---

## CMake / test target

Tests live in `noir_programs_boomerang_values` gtest binary:

```bash
cd barretenberg/cpp/build
cmake --build . --target noir_programs_boomerang_values_tests -j$(nproc)
./bin/noir_programs_boomerang_values_tests --gtest_filter='HNRecursionTestSuite.*'
```

New `.test.cpp` files in that directory are picked up by existing CMake target (no CMake edit unless new library deps).

---

## Checklist before opening PR

- [ ] `make_*_acir_setup()` is thin; generic logic not duplicated
- [ ] Smoke test proves ACIR → circuit path
- [ ] Dump test produces `*_functions_analysis.txt` artifact
- [ ] Constants promoted to validation header (if validator work follows)
- [ ] ACIR path used for witness anchors (`constraint.key`, not re-added native vars)
- [ ] Focused gtest filter documented in commit / PR test plan
