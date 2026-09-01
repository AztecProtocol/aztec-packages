// bb-ref fixture dumper (test-only). Writes the UltraHonk proving instance of an ACIR program to disk so
// the Rust reference implementation can prove from the exact same polynomials.
//
//   BBREF_PROGRAM=<program.json> BBREF_WITNESS=<witness.gz> BBREF_OUT=<dir> ./bin/dsl_tests
//   --gtest_filter='BbRefDump.*'
//
// Layout of <dir>/{nozk,zk,mega_app}/: (mega_app: MegaAppFlavor instance, proof.bin = Oink proof) meta.txt (key=value),
// <ENTITY>.bin (dyadic_size * 32 big-endian bytes, one file per unshifted entity in AllEntities order, captured BEFORE
// Oink), public_inputs.bin, memory_*_records.txt, rom_logup_records.txt, proof.bin (the proof bb produces from this
// instance, 32 bytes per field).
#include "acir_format.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/chonk/batched_honk_translator/batched_honk_translator_prover.hpp"
#include "barretenberg/chonk/batched_honk_translator/batched_honk_translator_verifier.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/chonk/private_execution_steps.hpp"
#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/commitment_schemes/triple_ipa/triple_ipa.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_trace_checker.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/goblin/batch_merge_prover.hpp"
#include "barretenberg/goblin/batch_merge_verifier.hpp"
#include "barretenberg/goblin/merge_prover.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/hypernova/hypernova_decider_prover.hpp"
#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/polynomials/row_disabling_polynomial.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/hash/keccak/keccak.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup_secp256r1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib/primitives/field/field_utils.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib/primitives/logic/logic.hpp"
#include "barretenberg/stdlib/primitives/memory/ram_table.hpp"
#include "barretenberg/stdlib/primitives/memory/rom_table.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"
#include "recursion_constraint_output.hpp"
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <gtest/gtest.h>
#include <sstream>

namespace {
using namespace bb;

void write_file(const std::filesystem::path& path, const std::vector<uint8_t>& data)
{
    std::ofstream f(path, std::ios::binary);
    f.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.size()));
}

void write_frs(const std::filesystem::path& path, const auto& values, size_t n)
{
    std::vector<uint8_t> buf;
    buf.reserve(n * 32);
    for (size_t j = 0; j < n; ++j) {
        auto b = to_buffer(fr(values.get(j)));
        buf.insert(buf.end(), b.begin(), b.end());
    }
    write_file(path, buf);
}

template <typename Flavor>
void dump_from_builder(typename Flavor::CircuitBuilder& builder, const std::filesystem::path& out);

template <typename Flavor, typename Builder>
void dump_instance(const std::string& program_json,
                   const std::string& witness_path,
                   const std::filesystem::path& out,
                   bool has_ipa_claim = false)
{
    constexpr bool is_mega = std::is_same_v<Builder, MegaCircuitBuilder>;
    auto bytecode = get_bytecode(program_json);
    auto witness = get_bytecode(witness_path);
    acir_format::ProgramMetadata metadata{ .has_ipa_claim = has_ipa_claim };
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(bytecode), is_mega), {} };
    program.witness = acir_format::witness_buf_to_witness_vector(std::move(witness));
    auto builder = acir_format::create_circuit<Builder>(program, metadata);
    dump_from_builder<Flavor>(builder, out);
}

/**
 * Write the proving instance of a finalized-or-not builder, its VK, and a proof (full Ultra proof
 * for Ultra flavors, Oink proof for Mega flavors, which have no standalone prover).
 */
template <typename Flavor>
void dump_from_builder(typename Flavor::CircuitBuilder& builder, const std::filesystem::path& out)
{
    constexpr bool is_mega = std::is_same_v<typename Flavor::CircuitBuilder, MegaCircuitBuilder>;
    auto instance = std::make_shared<ProverInstance_<Flavor>>(builder);

    std::filesystem::create_directories(out);
    const size_t n = instance->dyadic_size();
    {
        std::ofstream meta(out / "meta.txt");
        meta << "dyadic_size=" << n << "\n"
             << "num_public_inputs=" << instance->num_public_inputs() << "\n"
             << "pub_inputs_offset=" << instance->pub_inputs_offset() << "\n"
             << "final_active_wire_idx=" << instance->get_final_active_wire_idx() << "\n"
             << "max_end_index=" << instance->polynomials.max_end_index() << "\n";
    }
    auto write_indices = [&](const char* name, const std::vector<uint32_t>& v) {
        std::ofstream f(out / name);
        for (auto x : v) {
            f << x << "\n";
        }
    };
    write_indices("memory_read_records.txt", instance->memory_read_records);
    write_indices("memory_write_records.txt", instance->memory_write_records);
    write_indices("rom_logup_records.txt", instance->rom_logup_records);

    const auto& labels = Flavor::template AllEntities<std::string>::get_labels();
    size_t i = 0;
    for (const auto& poly : instance->polynomials.get_unshifted()) {
        write_frs(out / (labels[i] + ".bin"), poly, n);
        ++i;
    }
    {
        std::vector<uint8_t> buf;
        for (const auto& pi : instance->public_inputs) {
            auto b = to_buffer(pi);
            buf.insert(buf.end(), b.begin(), b.end());
        }
        write_file(out / "public_inputs.bin", buf);
    }

    auto vk = std::make_shared<typename Flavor::VerificationKey>(instance->get_precomputed());
    // Ultra flavors: the full proof. Mega flavors have no standalone prover; dump the Oink proof.
    std::vector<fr> proof;
    if constexpr (is_mega) {
        auto transcript = std::make_shared<typename Flavor::Transcript>();
        OinkProver<Flavor> oink{ instance, vk, transcript };
        oink.prove();
        proof = oink.export_proof();
    } else {
        UltraProver_<Flavor> prover{ instance, vk };
        proof = prover.construct_proof();
    }
    std::vector<uint8_t> buf;
    for (const auto& x : proof) {
        auto b = to_buffer(x);
        buf.insert(buf.end(), b.begin(), b.end());
    }
    write_file(out / "proof.bin", buf);
    write_file(out / "vk", to_buffer(*vk));
}

// ---- circuit scripts: one builder call per line (see bb-ref fixtures/scripts/*.txt) ----

std::vector<uint8_t> parse_hex_bytes(std::string s)
{
    if (s.rfind("0x", 0) == 0) {
        s = s.substr(2);
    }
    std::vector<uint8_t> bytes(32, 0);
    size_t n = s.size();
    for (size_t i = 0; i < n; ++i) {
        // right-align: last hex digit is the least significant nibble
        uint8_t v = static_cast<uint8_t>(std::stoi(s.substr(n - 1 - i, 1), nullptr, 16));
        size_t byte = 31 - i / 2;
        bytes[byte] |= static_cast<uint8_t>(i % 2 == 0 ? v : v << 4);
    }
    return bytes;
}

// Decimal (optionally negative) or 0x-prefixed hex.
template <typename F> F parse_field(const std::string& s)
{
    if (s.rfind("0x", 0) == 0) {
        auto bytes = parse_hex_bytes(s);
        return F::serialize_from_buffer(bytes.data());
    }
    bool neg = s[0] == '-';
    F v(std::stoull(neg ? s.substr(1) : s));
    return neg ? -v : v;
}

void run_script(MegaCircuitBuilder& b, const std::string& path)
{
    using field_ct = stdlib::field_t<MegaCircuitBuilder>;
    using Fr = bb::fr;
    std::vector<stdlib::rom_table<MegaCircuitBuilder>> roms;
    std::vector<stdlib::ram_table<MegaCircuitBuilder>> rams;
    std::ifstream in(path);
    std::string line;
    while (std::getline(in, line)) {
        std::istringstream ss(line);
        std::vector<std::string> t;
        for (std::string tok; ss >> tok;) {
            t.push_back(tok);
        }
        if (t.empty() || t[0][0] == '#') {
            continue;
        }
        auto u = [&](size_t i) { return static_cast<uint32_t>(std::stoul(t[i])); };
        auto f = [&](size_t i) { return parse_field<Fr>(t[i]); };
        auto q = [&](size_t i) { return parse_field<bb::fq>(t[i]); };
        auto w = [&](size_t i) { return field_ct::from_witness_index(&b, u(i)); };
        const std::string& op = t[0];
        if (op == "var") {
            b.add_variable(f(1));
        } else if (op == "pub") {
            b.add_public_variable(f(1));
        } else if (op == "add_gate") {
            b.create_big_add_gate({ u(1), u(2), u(3), u(4), f(5), f(6), f(7), f(8), f(9) },
                                  t.size() > 10 && t[10] == "1");
        } else if (op == "mul_gate") {
            b.create_big_mul_add_gate({ u(1), u(2), u(3), u(4), f(5), f(6), f(7), f(8), f(9), f(10) });
        } else if (op == "bool") {
            b.create_bool_gate(u(1));
        } else if (op == "range") {
            b.create_dyadic_range_constraint(u(1), u(2), "script range");
        } else if (op == "bilinear" || op == "batched_eq") {
            const bool bilinear = op == "bilinear";
            b.create_bilinear_batched_eq_gate(
                { .mode = bilinear ? BilinearBatchedEqMode::Bilinear : BilinearBatchedEqMode::BatchedEq,
                  .a = u(1),
                  .b = u(2),
                  .c = u(3),
                  .d = u(4),
                  .q_l = f(5),
                  .q_r = f(6),
                  .q_o = f(7),
                  .q_4 = f(8),
                  .q_c = f(9),
                  .q_m = f(10),
                  .q_5 = bilinear ? f(11) : Fr(0) });
        } else if (op == "calldata") {
            b.add_public_calldata(static_cast<BusId>(u(1)), u(2));
        } else if (op == "retdata") {
            b.add_public_return_data(u(1));
        } else if (op == "read_calldata") {
            b.read_calldata(static_cast<BusId>(u(1)), u(2));
        } else if (op == "read_retdata") {
            b.read_return_data(u(1));
        } else if (op == "ecc_add") {
            b.queue_ecc_add_accum(g1::affine_element(q(1), q(2)));
        } else if (op == "ecc_mul") {
            b.queue_ecc_mul_accum(g1::affine_element(q(1), q(2)), f(3));
        } else if (op == "ecc_eq") {
            b.queue_ecc_eq();
        } else if (op == "ecc_no_op") {
            b.queue_ecc_no_op();
        } else if (op == "poseidon2") {
            typename stdlib::Poseidon2Permutation<MegaCircuitBuilder>::State state{ w(1), w(2), w(3), w(4) };
            stdlib::Poseidon2Permutation<MegaCircuitBuilder>::permutation(&b, state);
        } else if (op == "rom" || op == "ram") {
            std::vector<field_ct> entries;
            for (size_t i = 2; i < 2 + u(1); ++i) {
                entries.push_back(w(i));
            }
            if (op == "rom") {
                roms.emplace_back(&b, entries);
            } else {
                rams.emplace_back(&b, entries);
            }
        } else if (op == "rom_read") {
            roms[u(1)][w(2)];
        } else if (op == "ram_read") {
            rams[u(1)].read(w(2));
        } else if (op == "ram_write") {
            rams[u(1)].write(w(2), w(3));
        } else if (op == "default_io") {
            stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>::add_default(b);
        } else {
            throw_or_abort("unknown script command: " + op);
        }
    }
}
} // namespace

// BBREF_SCRIPT=<script> BBREF_FLAVOR=app|kernel|zk BBREF_OUT=<dir> ./bin/dsl_tests
// --gtest_filter='BbRefDump.MegaScript'
TEST(BbRefDump, MegaScript)
{
    const char* script = std::getenv("BBREF_SCRIPT");
    const char* flavor = std::getenv("BBREF_FLAVOR");
    const char* out = std::getenv("BBREF_OUT");
    if (script == nullptr || flavor == nullptr || out == nullptr) {
        GTEST_SKIP() << "set BBREF_SCRIPT, BBREF_FLAVOR, BBREF_OUT";
    }
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    MegaCircuitBuilder builder{ std::make_shared<ECCOpQueue>() };
    run_script(builder, script);
    const std::string f(flavor);
    if (f == "app") {
        dump_from_builder<MegaAppFlavor>(builder, out);
    } else if (f == "kernel") {
        dump_from_builder<MegaKernelFlavor>(builder, out);
    } else if (f == "zk") {
        dump_from_builder<MegaZKFlavor>(builder, out);
    } else {
        throw_or_abort("BBREF_FLAVOR must be app|kernel|zk");
    }
}

// Serialize an accumulator: challenge, evaluations, then the two commitments as raw 64-byte affine points.
void write_accumulator(const std::filesystem::path& path, const MultilinearBatchingVerifierClaim<curve::BN254>& acc)
{
    std::vector<uint8_t> buf;
    auto push_fr = [&](const fr& x) {
        auto b = to_buffer(x);
        buf.insert(buf.end(), b.begin(), b.end());
    };
    for (const auto& c : acc.challenge) {
        push_fr(c);
    }
    push_fr(acc.non_shifted_evaluation);
    push_fr(acc.shifted_evaluation);
    for (const auto& comm : { acc.non_shifted_commitment, acc.shifted_commitment }) {
        auto b = to_buffer(comm);
        buf.insert(buf.end(), b.begin(), b.end());
    }
    write_file(path, buf);
}

void write_proof(const std::filesystem::path& path, const HonkProof& proof)
{
    std::vector<uint8_t> buf;
    for (const auto& x : proof) {
        auto b = to_buffer(x);
        buf.insert(buf.end(), b.begin(), b.end());
    }
    write_file(path, buf);
}

// BBREF_SCRIPTS=<script>:<kernel|app>,... BBREF_PREV=0|1 BBREF_OUT=<dir> ./bin/dsl_tests
// --gtest_filter='BbRefDump.Folding' Folds the scripted circuits as one HyperNova group (optionally against a previous
// accumulator built from the first circuit on a separate transcript), then runs the decider. Dumps every proof, VK and
// accumulator, and cross-checks natively.
TEST(BbRefDump, Folding)
{
    const char* scripts_env = std::getenv("BBREF_SCRIPTS");
    const char* out_env = std::getenv("BBREF_OUT");
    if (scripts_env == nullptr || out_env == nullptr) {
        GTEST_SKIP() << "set BBREF_SCRIPTS, BBREF_OUT";
    }
    const bool use_prev = std::getenv("BBREF_PREV") != nullptr && std::string(std::getenv("BBREF_PREV")) == "1";
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    std::filesystem::path out(out_env);
    std::filesystem::create_directories(out);

    std::vector<std::pair<std::string, std::string>> entries;
    {
        std::istringstream ss(scripts_env);
        for (std::string item; std::getline(ss, item, ',');) {
            auto colon = item.rfind(':');
            entries.emplace_back(item.substr(0, colon), item.substr(colon + 1));
        }
    }

    using ProverAccumulator = HypernovaFoldingProver::Accumulator;
    using VerifierAccumulator = MultilinearBatchingVerifierClaim<curve::BN254>;

    // Per-entry accumulate: builds the circuit, runs Oink + sumcheck under the entry's flavor. Returns the proof
    // and registers a verifier callback.
    std::vector<std::function<bool(HypernovaFoldingNativeVerifier&, const HonkProof&)>> verifiers;
    auto accumulate = [&](HypernovaFoldingProver& prover, size_t idx, bool register_verifier) -> HonkProof {
        const auto& [script, kind] = entries[idx];
        MegaCircuitBuilder builder{ std::make_shared<ECCOpQueue>() };
        run_script(builder, script);
        auto run = [&]<typename Flavor>() -> HonkProof {
            auto instance = std::make_shared<ProverInstance_<Flavor>>(builder);
            auto vk = std::make_shared<typename Flavor::VerificationKey>(instance->get_precomputed());
            if (register_verifier) {
                write_file(out / ("vk_" + std::to_string(idx)), to_buffer(*vk));
                verifiers.emplace_back([vk](HypernovaFoldingNativeVerifier& v, const HonkProof& proof) {
                    auto vi =
                        std::make_shared<VerifierInstance_<Flavor>>(std::make_shared<typename Flavor::VKAndHash>(vk));
                    return v.accumulate_instance<Flavor>(vi, proof);
                });
            }
            return prover.accumulate_instance<Flavor>(instance, vk);
        };
        if (kind == "kernel") {
            return run.template operator()<MegaKernelFlavor>();
        }
        if (kind == "app") {
            return run.template operator()<MegaAppFlavor>();
        }
        throw_or_abort("kind must be kernel|app");
    };

    std::optional<ProverAccumulator> prev;
    std::optional<VerifierAccumulator> prev_verifier;
    if (use_prev) {
        auto transcript = std::make_shared<NativeTranscript>();
        HypernovaFoldingProver prover(transcript);
        accumulate(prover, 0, /*register_verifier=*/false);
        auto [_p, acc] = prover.finalize();
        prev_verifier = acc.to_verifier_claim_for_testing();
        write_accumulator(out / "prev_accumulator.bin", *prev_verifier);
        prev = std::move(acc);
    }

    auto transcript = std::make_shared<NativeTranscript>();
    HypernovaFoldingProver prover(transcript);
    std::vector<HonkProof> proofs;
    for (size_t i = 0; i < entries.size(); ++i) {
        proofs.push_back(accumulate(prover, i, /*register_verifier=*/true));
        write_proof(out / ("instance_proof_" + std::to_string(i) + ".bin"), proofs.back());
    }
    auto [batch_proof, accumulator] = prover.finalize(std::move(prev));
    write_proof(out / "batch_proof.bin", batch_proof);
    write_accumulator(out / "accumulator.bin", accumulator.to_verifier_claim_for_testing());
    HypernovaDeciderProver decider(transcript);
    HonkProof decider_proof = decider.construct_proof(accumulator);
    write_proof(out / "decider_proof.bin", decider_proof);

    // Native cross-check: verify the group, compare accumulators, verify the decider.
    auto verifier_transcript = std::make_shared<NativeTranscript>();
    HypernovaFoldingNativeVerifier verifier(verifier_transcript);
    for (size_t i = 0; i < entries.size(); ++i) {
        ASSERT_TRUE(verifiers[i](verifier, proofs[i])) << "instance " << i;
    }
    auto [verified, verifier_acc] = verifier.finalize(batch_proof, prev_verifier);
    ASSERT_TRUE(verified);
    ASSERT_EQ(verifier_acc.non_shifted_commitment, accumulator.non_shifted_commitment);
    ASSERT_EQ(verifier_acc.shifted_evaluation, accumulator.shifted_evaluation);
    HypernovaDeciderVerifier<MegaKernelFlavor> decider_verifier(verifier_transcript);
    auto pairing_points = decider_verifier.verify_proof(verifier_acc, decider_proof);
    ASSERT_TRUE(pairing_points.check());
}

TEST(BbRefDump, UltraInstance)
{
    const char* program = std::getenv("BBREF_PROGRAM");
    const char* witness = std::getenv("BBREF_WITNESS");
    const char* out = std::getenv("BBREF_OUT");
    if (program == nullptr || witness == nullptr || out == nullptr) {
        GTEST_SKIP() << "set BBREF_PROGRAM, BBREF_WITNESS, BBREF_OUT";
    }
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    // BBREF_IPA=1: rollup circuits (RollupIO + combined honk+ipa proof); Ultra flavors only.
    if (std::getenv("BBREF_IPA") != nullptr) {
        bb::srs::init_grumpkin_file_crs_factory(bb::srs::bb_crs_path());
        dump_instance<UltraFlavor, UltraCircuitBuilder>(program, witness, std::filesystem::path(out) / "nozk", true);
        dump_instance<UltraZKFlavor, UltraCircuitBuilder>(program, witness, std::filesystem::path(out) / "zk", true);
        return;
    }
    dump_instance<UltraFlavor, UltraCircuitBuilder>(program, witness, std::filesystem::path(out) / "nozk");
    dump_instance<UltraZKFlavor, UltraCircuitBuilder>(program, witness, std::filesystem::path(out) / "zk");
    dump_instance<MegaAppFlavor, MegaCircuitBuilder>(program, witness, std::filesystem::path(out) / "mega_app");
}

// --- M6: Goblin merge / batch merge -----------------------------------------------------------------------
// BBREF_MODE=merge|batch BBREF_NUM_SUBTABLES=<N> [BBREF_MAX=<M>] BBREF_OUT=<dir> ./bin/dsl_tests
// --gtest_filter='BbRefDump.Merge' Builds a deterministic op queue (recipe mirrored in bb-ref tests/m6_merge.rs), dumps
// the random ZK prefix columns so the Rust side can inject them, and dumps the (batch) merge proof. Cross-checks
// natively.
namespace {
// Subtable i: ((1 + i) % 10) + 1 triples of add / mul (with a >128-bit scalar) / eq_and_reset.
void populate_subtable_deterministic(ECCOpQueue& q, size_t subtable_idx)
{
    using Point = curve::BN254::AffineElement;
    const size_t num_triples = ((1 + subtable_idx) % 10) + 1;
    for (size_t j = 0; j < num_triples; ++j) {
        const uint64_t k = 1 + (100 * subtable_idx) + j;
        q.add_accumulate(Point::one() * fr(k));
        q.mul_accumulate(Point::one() * fr(k + 1), fr(k + 2).invert());
        q.eq_and_reset();
    }
}

void write_columns(const std::filesystem::path& path, const auto& columns)
{
    std::vector<uint8_t> buf;
    for (const auto& col : columns) {
        for (size_t j = 0; j < col.size(); ++j) {
            auto b = to_buffer(fr(col[j]));
            buf.insert(buf.end(), b.begin(), b.end());
        }
    }
    write_file(path, buf);
}
} // namespace

TEST(BbRefDump, Merge)
{
    const char* mode_env = std::getenv("BBREF_MODE");
    const char* n_env = std::getenv("BBREF_NUM_SUBTABLES");
    const char* out_env = std::getenv("BBREF_OUT");
    if (mode_env == nullptr || n_env == nullptr || out_env == nullptr) {
        GTEST_SKIP() << "set BBREF_MODE, BBREF_NUM_SUBTABLES, BBREF_OUT";
    }
    const std::string mode(mode_env);
    const size_t num_subtables = std::stoul(n_env);
    const size_t max_subtables = std::getenv("BBREF_MAX") != nullptr ? std::stoul(std::getenv("BBREF_MAX")) : 9;
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    std::filesystem::path out(out_env);
    std::filesystem::create_directories(out);

    auto op_queue = std::make_shared<ECCOpQueue>();
    for (size_t i = 0; i < num_subtables; ++i) {
        if (i > 0) {
            op_queue->initialize_new_subtable();
        }
        populate_subtable_deterministic(*op_queue, i);
        op_queue->merge();
    }
    if (mode == "merge") {
        write_columns(out / "zk_columns.bin", op_queue->construct_zk_columns());
        op_queue->initialize_new_subtable();
        populate_subtable_deterministic(*op_queue, num_subtables);
        while (op_queue->get_current_subtable_size() < HIDING_KERNEL_ULTRA_OPS) {
            op_queue->add_accumulate(curve::BN254::AffineElement::one() *
                                     fr(1000 + op_queue->get_current_subtable_size()));
        }
        auto transcript = std::make_shared<NativeTranscript>();
        MergeProver prover{ op_queue, transcript };
        auto proof = prover.construct_proof();
        write_proof(out / "merge_proof.bin", proof);
        write_columns(out / "merged.bin", op_queue->construct_ultra_ops_table_columns());

        MergeVerifier::InputCommitments inputs;
        auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = op_queue->construct_table_columns_up_to_tail();
        for (size_t j = 0; j < 4; ++j) {
            inputs.t_commitments[j] = prover.pcs_commitment_key.commit(t_current[j]);
            inputs.T_prev_commitments[j] = prover.pcs_commitment_key.commit(T_prev[j]);
        }
        MergeVerifier verifier;
        auto result = verifier.reduce_to_pairing_check(proof, inputs);
        ASSERT_TRUE(result.reduction_succeeded);
        ASSERT_TRUE(result.pairing_points.check());
        return;
    }
    ASSERT_EQ(mode, "batch");
    // The batch merge prover builds the ZK prefix itself; dump it from the head of the merged table.
    BatchMergeProver prover{ op_queue, max_subtables };
    auto proof = prover.construct_proof();
    write_proof(out / "batch_merge_proof.bin", proof);
    auto merged = op_queue->construct_ultra_ops_table_columns();
    std::array<Polynomial<fr>, 4> zk_columns;
    for (size_t j = 0; j < 4; ++j) {
        zk_columns[j] = Polynomial<fr>(UltraEccOpsTable::ZK_ULTRA_OPS);
        for (size_t r = 0; r < UltraEccOpsTable::ZK_ULTRA_OPS; ++r) {
            zk_columns[j].at(r) = merged[j][r];
        }
    }
    write_columns(out / "zk_columns.bin", zk_columns);

    std::optional<fr> hash;
    for (const auto& cols : op_queue->construct_subtable_columns()) {
        std::vector<curve::BN254::AffineElement> comms;
        for (const auto& col : cols) {
            comms.push_back(prover.pcs_commitment_key.commit(col));
        }
        hash = BatchMergeVerifier::ecc_op_hash_step(comms, hash);
    }
    auto check = [&]<size_t M>() {
        BatchMergeVerifier_<curve::BN254, M> verifier;
        auto result = verifier.reduce_to_pairing_check(proof, *hash);
        ASSERT_TRUE(result.reduction_succeeded);
        ASSERT_TRUE(result.pairing_points.check());
    };
    if (max_subtables == 9) {
        check.template operator()<9>();
    } else {
        ASSERT_EQ(max_subtables, CHONK_MAX_NUM_CIRCUITS);
        check.template operator()<CHONK_MAX_NUM_CIRCUITS>();
    }
}

// --- M7: TripleIPA over Grumpkin ------------------------------------------------------------------------
// BBREF_LOG_N=4|15 BBREF_OUT=<dir> ./bin/dsl_tests --gtest_filter='BbRefDump.TripleIpa'
// Deterministic inputs (mirrored in bb-ref tests/m7_ipa.rs); dumps the proof and cross-checks natively.
namespace {
template <size_t LOG_N> void dump_triple_ipa(const std::filesystem::path& out)
{
    using Curve = curve::Grumpkin;
    using Fq = Curve::ScalarField;
    using PCS = TripleIPA<Curve, LOG_N>;
    constexpr size_t N = 1UL << LOG_N;
    CommitmentKey<Curve> ck(N);

    typename PCS::TripleIpaInput input;
    std::vector<Fq> u;
    for (size_t i = 0; i < LOG_N; ++i) {
        u.emplace_back(7 + i);
    }
    input.claim_data.unshifted.multilinear_challenge = u;
    const auto eq = ProverEqPolynomial<Fq>::construct(std::span<const Fq>(u), LOG_N);
    for (size_t k = 0; k < 5; ++k) {
        Polynomial<Fq> p(N);
        for (size_t i = 0; i < N; ++i) {
            p.at(i) = Fq((k + 1) * 1000 + i + 1);
        }
        input.claim_data.unshifted.evaluations.emplace_back(p.evaluate_mle(std::span<const Fq>(u)));
        input.claim_data.unshifted.commitments.emplace_back(ck.commit(p));
        input.unshifted_polynomials.emplace_back(std::move(p));
    }
    input.claim_data.unshifted.rho_powers = PCS::TripleIpaClaimData::rho_powers(Fq(11), 5);
    input.claim_data.shifted.rho_powers = PCS::TripleIpaClaimData::rho_powers(Fq(13), 2);
    for (const size_t source_idx : std::array<size_t, 2>{ 1, 3 }) {
        input.claim_data.shifted.commitments.emplace_back(input.claim_data.unshifted.commitments[source_idx]);
        input.claim_data.shifted.source_unshifted_evaluations.emplace_back(
            input.claim_data.unshifted.evaluations[source_idx]);
        input.claim_data.shifted.shifted_evaluations.emplace_back(
            ShiftedEqPolynomial<Curve, LOG_N>::evaluate_from_eq(eq, input.unshifted_polynomials[source_idx]));
        input.shifted_polynomials.emplace_back(input.unshifted_polynomials[source_idx].share());
    }
    Polynomial<Fq> q(N);
    for (size_t i = 0; i < N; ++i) {
        q.at(i) = Fq(500 + i);
    }
    input.claim_data.univariate.opening_pair.challenge = Fq(17);
    input.claim_data.univariate.opening_pair.evaluation = q.evaluate(Fq(17));
    input.claim_data.univariate.commitment = ck.commit(q);
    input.univariate_polynomial = std::move(q);

    auto prover_transcript = std::make_shared<NativeTranscript>();
    PCS::compute_opening_proof(ck, input, prover_transcript);
    auto proof = prover_transcript->export_proof();
    write_proof(out / "triple_ipa_proof.bin", proof);

    VerifierCommitmentKey<Curve> vk(N, srs::get_grumpkin_crs_factory());
    auto verifier_transcript = std::make_shared<NativeTranscript>(proof);
    ASSERT_TRUE(PCS::reduce_verify(vk, input.claim_data.batch(), verifier_transcript));
}
} // namespace

TEST(BbRefDump, TripleIpa)
{
    const char* log_n_env = std::getenv("BBREF_LOG_N");
    const char* out_env = std::getenv("BBREF_OUT");
    if (log_n_env == nullptr || out_env == nullptr) {
        GTEST_SKIP() << "set BBREF_LOG_N, BBREF_OUT";
    }
    srs::init_grumpkin_file_crs_factory(srs::bb_crs_path());
    std::filesystem::path out(out_env);
    std::filesystem::create_directories(out);
    const size_t log_n = std::stoul(log_n_env);
    if (log_n == 4) {
        dump_triple_ipa<4>(out);
    } else {
        ASSERT_EQ(log_n, 15UL);
        dump_triple_ipa<15>(out);
    }
}

// --- M8: ECCVM trace --------------------------------------------------------------------------------------
// BBREF_CASE=base|msm9 BBREF_OUT=<dir> ./bin/dsl_tests --gtest_filter='BbRefDump.Eccvm'
// Deterministic op queues (mirrored in bb-ref tests/m8_eccvm.rs); dumps every ECCVM column (AllEntities order)
// over the active rows, with the derived witness computed for beta = 2, gamma = 3.
namespace {
void build_eccvm_ops(ECCOpQueue& q, const std::string& kind)
{
    using G1 = bb::g1;
    using Fr = G1::Fr;
    using Point = G1::affine_element;
    auto pt = [](uint64_t k) { return Point(G1::one * Fr(k)); };
    const Point inf = G1::affine_point_at_infinity;
    const Fr x = Fr(123456789).invert();
    const Fr y = Fr(987654321).invert();
    const Fr zero_scalar = 0;
    if (kind == "base") {
        const Point a = pt(3);
        const Point b = pt(5);
        const Point c = pt(7);
        q.add_accumulate(a);
        q.mul_accumulate(a, x);
        q.mul_accumulate(b, x);
        q.mul_accumulate(b, y);
        q.add_accumulate(a);
        q.mul_accumulate(b, x);
        q.add_accumulate(b);
        q.eq_and_reset();
        q.add_accumulate(c);
        q.mul_accumulate(a, x);
        q.mul_accumulate(inf, x);
        q.mul_accumulate(b, x);
        q.eq_and_reset();
        q.mul_accumulate(a, x);
        q.mul_accumulate(b, x);
        q.mul_accumulate(inf, zero_scalar);
        q.mul_accumulate(c, x);
        q.eq_and_reset();
        q.mul_accumulate(inf, zero_scalar);
        q.mul_accumulate(inf, x);
        q.mul_accumulate(inf, zero_scalar);
        q.add_accumulate(a);
        q.eq_and_reset();
        q.add_accumulate(a);
        q.add_accumulate(inf);
        q.eq_and_reset();
        q.add_accumulate(inf);
        q.eq_and_reset();
        q.mul_accumulate(inf, x);
        q.mul_accumulate(inf, -x);
        q.eq_and_reset();
        q.add_accumulate(a);
        q.mul_accumulate(inf, x);
        q.mul_accumulate(inf, -x);
        q.add_accumulate(a);
        q.add_accumulate(a);
        q.eq_and_reset();
    } else {
        for (uint64_t k = 0; k < 9; ++k) {
            q.mul_accumulate(pt(k + 11), Fr(1000 + k).invert());
        }
        q.eq_and_reset();
    }
    q.merge();
    q.append_hiding_op(curve::BN254::BaseField(11), curve::BN254::BaseField(13));
}
} // namespace

TEST(BbRefDump, Eccvm)
{
    const char* case_env = std::getenv("BBREF_CASE");
    const char* out_env = std::getenv("BBREF_OUT");
    if (case_env == nullptr || out_env == nullptr) {
        GTEST_SKIP() << "set BBREF_CASE, BBREF_OUT";
    }
    std::filesystem::path out(out_env);
    std::filesystem::create_directories(out);
    auto op_queue = std::make_shared<ECCOpQueue>();
    build_eccvm_ops(*op_queue, case_env);
    ECCVMCircuitBuilder builder{ op_queue };
    ASSERT_TRUE(ECCVMTraceChecker::check(builder));

    using FF = ECCVMFlavor::FF;
    ECCVMFlavor::ProverPolynomials polys(builder);
    const FF beta(2);
    const FF gamma(3);
    const FF beta_sqr = beta.sqr();
    const FF beta_quartic = beta_sqr * beta_sqr;
    const FF tag = beta_quartic;
    FF delta = (gamma + tag) * (gamma + beta_sqr + tag) * (gamma + beta_sqr + beta_sqr + tag) *
               (gamma + beta_sqr + beta_sqr + beta_sqr + tag);
    RelationParameters<FF> params{
        .eta = 0,
        .beta = beta,
        .gamma = gamma,
        .public_input_delta = 0,
        .beta_sqr = beta_sqr,
        .beta_cube = beta_sqr * beta,
        .beta_quartic = beta_quartic,
        .eccvm_set_permutation_delta = delta.invert(),
    };
    compute_logderivative_inverse<FF, ECCVMLookupRelation<FF>>(polys, params, ECCVMFlavor::TRACE_OFFSET);
    compute_grand_product<ECCVMFlavor, ECCVMSetRelation<FF>>(polys, params);
    polys.z_perm_shift = ECCVMFlavor::Polynomial(polys.z_perm.shifted());

    const size_t num_rows = polys.row_skip_active_prefix_end + 2;
    std::vector<uint8_t> buf;
    for (int shift = 24; shift >= 0; shift -= 8) {
        buf.push_back(static_cast<uint8_t>((num_rows >> shift) & 0xff));
    }
    for (const auto& poly : polys.get_all()) {
        for (size_t r = 0; r < num_rows; ++r) {
            auto b = to_buffer(poly.get(r));
            buf.insert(buf.end(), b.begin(), b.end());
        }
    }
    write_file(out / "eccvm_columns.bin", buf);
}

// --- M9: ECCVM proof --------------------------------------------------------------------------------------
// Dump:   BBREF_CASE=base BBREF_OUT=<dir> ./bin/dsl_tests --gtest_filter='BbRefDump.EccvmProof'
// Verify: BBREF_IN=<dir with eccvm_proof.bin, ipa_proof.bin> ./bin/dsl_tests --gtest_filter='BbRefDump.EccvmProof'
namespace {
std::vector<fr> read_proof(const std::filesystem::path& path)
{
    std::ifstream f(path, std::ios::binary);
    std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    std::vector<fr> out;
    for (size_t i = 0; i + 32 <= bytes.size(); i += 32) {
        out.push_back(from_buffer<fr>(bytes.data() + i));
    }
    return out;
}
} // namespace

TEST(BbRefDump, EccvmProof)
{
    const char* in_env = std::getenv("BBREF_IN");
    const char* case_env = std::getenv("BBREF_CASE");
    const char* out_env = std::getenv("BBREF_OUT");
    if (in_env == nullptr && (case_env == nullptr || out_env == nullptr)) {
        GTEST_SKIP() << "set BBREF_IN, or BBREF_CASE and BBREF_OUT";
    }
    srs::init_grumpkin_file_crs_factory(srs::bb_crs_path());
    using Transcript = ECCVMFlavor::Transcript;
    auto verify = [](const HonkProof& proof, const HonkProof& ipa_proof) {
        ECCVMVerifier verifier(std::make_shared<Transcript>(), proof);
        auto result = verifier.reduce_to_triple_ipa_claim();
        EXPECT_TRUE(result.reduction_succeeded);
        auto ipa_vk = ECCVMFlavor::VerifierCommitmentKey{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        auto ipa_transcript = std::make_shared<NativeTranscript>(ipa_proof);
        EXPECT_TRUE(ECCVMVerifier::TripleIPA::reduce_verify(ipa_vk, result.triple_ipa_claim, ipa_transcript));
    };
    if (in_env != nullptr) {
        std::filesystem::path in(in_env);
        verify(read_proof(in / "eccvm_proof.bin"), read_proof(in / "ipa_proof.bin"));
        return;
    }
    std::filesystem::path out(out_env);
    std::filesystem::create_directories(out);
    auto op_queue = std::make_shared<ECCOpQueue>();
    build_eccvm_ops(*op_queue, case_env);
    ECCVMCircuitBuilder builder{ op_queue };
    auto transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, transcript);
    auto proof = prover.construct_proof();
    write_proof(out / "eccvm_proof.bin", proof);
    write_proof(out / "ipa_proof.bin", prover.ipa_proof);
    verify(proof, prover.ipa_proof);
}

// --- M10: Translator circuit + proving key ----------------------------------------------------------------
// Deterministic op queue for the translator fixtures: two merged subtables, the ZK prefix, a fixed-append
// subtable ending in two random ops. The ZK prefix and random ops are dumped for injection into Rust.
std::shared_ptr<ECCOpQueue> build_translator_queue(const std::filesystem::path& out)
{
    auto op_queue = std::make_shared<ECCOpQueue>();
    for (size_t i = 0; i < 2; ++i) {
        if (i > 0) {
            op_queue->initialize_new_subtable();
        }
        populate_subtable_deterministic(*op_queue, i);
        op_queue->merge();
    }
    write_columns(out / "zk_columns.bin", op_queue->construct_zk_columns());
    op_queue->initialize_new_subtable();
    populate_subtable_deterministic(*op_queue, 2);
    std::vector<fr> random_values;
    for (size_t i = 0; i < 2; ++i) {
        auto op = op_queue->random_op_ultra_only();
        for (const auto& v : { op.op_code.random_value_1,
                               op.op_code.random_value_2,
                               op.x_lo,
                               op.x_hi,
                               op.y_lo,
                               op.y_hi,
                               op.z_1,
                               op.z_2 }) {
            random_values.push_back(v);
        }
    }
    write_proof(out / "random_ops.bin", random_values);
    op_queue->merge_fixed_append(op_queue->get_append_offset_for_prover());
    return op_queue;
}

// Masking values of the key's non-op-queue wires (bb draws them at random; Rust injects them).
void write_translator_masking(const std::filesystem::path& path, TranslatorProvingKey& key)
{
    std::vector<fr> masking;
    auto wire_polys = key.proving_key->polynomials.get_wires();
    for (size_t w = TranslatorFlavor::NUM_OP_QUEUE_WIRES; w < wire_polys.size(); ++w) {
        for (size_t i = TranslatorFlavor::MINI_CIRCUIT_SIZE - TranslatorFlavor::NUM_MASKED_ROWS_END;
             i < TranslatorFlavor::MINI_CIRCUIT_SIZE;
             ++i) {
            masking.push_back(wire_polys[w][i]);
        }
    }
    write_proof(path, masking);
}

// BBREF_OUT=<dir> ./bin/dsl_tests --gtest_filter='BbRefDump.Translator'
// Deterministic op queue (two merged subtables, the ZK prefix, a fixed-append subtable ending in two random
// ops); dumps the ZK prefix and random ops for injection, the circuit wires, the key's masking values, and
// the key's precomputed / ordered / concatenated / z_perm columns at beta = 2, gamma = 3.
TEST(BbRefDump, Translator)
{
    const char* out_env = std::getenv("BBREF_OUT");
    if (out_env == nullptr) {
        GTEST_SKIP() << "set BBREF_OUT";
    }
    std::filesystem::path out(out_env);
    std::filesystem::create_directories(out);
    using Fq = curve::BN254::BaseField;

    auto op_queue = build_translator_queue(out);

    const Fq v = Fq(11).invert();
    const Fq x = Fq(13).invert();
    TranslatorCircuitBuilder circuit(v, x, op_queue);
    ASSERT_TRUE(TranslatorCircuitChecker::check(circuit));
    {
        std::vector<fr> wires;
        wires.push_back(fr(circuit.num_gates()));
        for (const auto& wire : circuit.wires) {
            for (size_t i = 0; i < circuit.num_gates(); ++i) {
                wires.push_back(circuit.get_variable(wire[i]));
            }
        }
        write_proof(out / "wires.bin", wires);
    }

    TranslatorProvingKey key(circuit);
    auto& polys = key.proving_key->polynomials;
    write_translator_masking(out / "masking.bin", key);
    using Builder = TranslatorCircuitBuilder;
    RelationParameters<fr> params;
    {
        const Fq v2 = v * v;
        const Fq v3 = v2 * v;
        const Fq v4 = v3 * v;
        auto with_native = [](const Fq& f) {
            auto l = Builder::split_fq_into_limbs(f);
            return std::array<fr, 5>{ l[0], l[1], l[2], l[3], fr(uint256_t(f)) };
        };
        params.beta = fr(2);
        params.gamma = fr(3);
        params.evaluation_input_x = with_native(x);
        params.batching_challenge_v = { with_native(v), with_native(v2), with_native(v3), with_native(v4) };
        params.accumulated_result = {
            circuit.get_variable(circuit.wires[Builder::WireIds::ACCUMULATORS_BINARY_LIMBS_0][Builder::RESULT_ROW]),
            circuit.get_variable(circuit.wires[Builder::WireIds::ACCUMULATORS_BINARY_LIMBS_1][Builder::RESULT_ROW]),
            circuit.get_variable(circuit.wires[Builder::WireIds::ACCUMULATORS_BINARY_LIMBS_2][Builder::RESULT_ROW]),
            circuit.get_variable(circuit.wires[Builder::WireIds::ACCUMULATORS_BINARY_LIMBS_3][Builder::RESULT_ROW]),
        };
    }
    compute_grand_product<TranslatorFlavor, TranslatorPermutationRelation<fr>>(polys, params);
    {
        std::vector<uint8_t> buf;
        auto all = polys.get_all();
        const std::vector<size_t> entities = { 1,  2,  3,  4,  5,  6,  7,  8,   9,   10,  11,
                                               93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103 };
        for (size_t e : entities) {
            for (size_t r = 0; r < TranslatorFlavor::ProverPolynomials::get_polynomial_size(); ++r) {
                auto b = to_buffer(all[e].get(r));
                buf.insert(buf.end(), b.begin(), b.end());
            }
        }
        write_file(out / "columns.bin", buf);
    }
}

// --- M11: BatchedHonkTranslator joint proof ----------------------------------------------------------------
// Dump:   BBREF_SCRIPT=<mega_zk script> BBREF_OUT=<dir> ./bin/dsl_tests --gtest_filter='BbRefDump.Batched'
// Verify: BBREF_SCRIPT=<mega_zk script> BBREF_IN=<dir with oink_proof.bin, joint_proof.bin, accumulated_result.bin,
//         op_queue_wires.bin> ./bin/dsl_tests --gtest_filter='BbRefDump.Batched'
// The MegaZK circuit comes from the script; the translator key from the deterministic op queue above.
TEST(BbRefDump, Batched)
{
    const char* script = std::getenv("BBREF_SCRIPT");
    const char* in_env = std::getenv("BBREF_IN");
    const char* out_env = std::getenv("BBREF_OUT");
    if (script == nullptr || (in_env == nullptr && out_env == nullptr)) {
        GTEST_SKIP() << "set BBREF_SCRIPT and BBREF_IN or BBREF_OUT";
    }
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    using Fq = curve::BN254::BaseField;
    using G1 = curve::BN254::AffineElement;
    MegaCircuitBuilder builder{ std::make_shared<ECCOpQueue>() };
    run_script(builder, script);
    auto inst = std::make_shared<ProverInstance_<MegaZKFlavor>>(builder);
    auto vk = std::make_shared<MegaZKFlavor::VerificationKey>(inst->get_precomputed());
    auto vk_and_hash = std::make_shared<MegaZKFlavor::VKAndHash>(vk);
    const Fq v = Fq(11).invert();
    const Fq x = Fq(13).invert();
    auto verify = [&](const HonkProof& oink, const HonkProof& joint, const Fq& acc, const std::array<G1, 4>& opq) {
        auto transcript = std::make_shared<NativeTranscript>();
        BatchedHonkTranslatorVerifier verifier(vk_and_hash, transcript);
        verifier.verify_mega_zk_oink(oink);
        auto result = verifier.verify(joint, x, v, acc, opq);
        EXPECT_TRUE(result.reduction_succeeded);
        EXPECT_TRUE(result.pairing_points.check());
    };
    if (in_env != nullptr) {
        std::filesystem::path in(in_env);
        auto read_bytes = [](const std::filesystem::path& path) {
            std::ifstream f(path, std::ios::binary);
            return std::vector<uint8_t>((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
        };
        auto acc_bytes = read_bytes(in / "accumulated_result.bin");
        const Fq acc = from_buffer<Fq>(acc_bytes.data());
        auto opq_bytes = read_bytes(in / "op_queue_wires.bin");
        std::array<G1, 4> opq;
        for (size_t i = 0; i < 4; ++i) {
            opq[i] = from_buffer<G1>(opq_bytes.data() + 64 * i);
        }
        verify(read_proof(in / "oink_proof.bin"), read_proof(in / "joint_proof.bin"), acc, opq);
        return;
    }
    std::filesystem::path out(out_env);
    std::filesystem::create_directories(out);
    auto op_queue = build_translator_queue(out);
    TranslatorCircuitBuilder circuit(v, x, op_queue);
    auto key = std::make_shared<TranslatorProvingKey>(circuit);
    write_translator_masking(out / "masking.bin", *key);
    write_file(out / "vk", to_buffer(*vk));

    auto transcript = std::make_shared<NativeTranscript>();
    BatchedHonkTranslatorProver prover(inst, vk, transcript);
    auto oink = prover.prove_mega_zk_oink();
    {
        // the masked head rows of the derived MegaZK witnesses (for RNG tape debugging)
        std::vector<fr> head;
        for (const auto* poly : { &inst->polynomials.kernel_calldata_read_counts(),
                                  &inst->polynomials.kernel_calldata_inverses(),
                                  &inst->polynomials.z_perm() }) {
            for (size_t i = 0; i < 8; ++i) {
                head.push_back((*poly)[i]);
            }
        }
        write_proof(out / "oink_head_rows.bin", head);
    }
    auto joint = prover.prove(key);
    write_proof(out / "oink_proof.bin", oink);
    write_proof(out / "joint_proof.bin", joint);

    auto& polys = key->proving_key->polynomials;
    const size_t RESULT_ROW = TranslatorFlavor::RESULT_ROW;
    const Fq acc(uint256_t(polys.accumulators_binary_limbs_0[RESULT_ROW]) +
                 (uint256_t(polys.accumulators_binary_limbs_1[RESULT_ROW]) << 68) +
                 (uint256_t(polys.accumulators_binary_limbs_2[RESULT_ROW]) << 136) +
                 (uint256_t(polys.accumulators_binary_limbs_3[RESULT_ROW]) << 204));
    write_file(out / "accumulated_result.bin", to_buffer(acc));
    auto& ck = key->proving_key->commitment_key;
    const std::array<G1, 4> opq = {
        ck.commit(polys.op), ck.commit(polys.x_lo_y_hi), ck.commit(polys.x_hi_z_1), ck.commit(polys.y_lo_z_2)
    };
    std::vector<uint8_t> opq_bytes;
    for (const auto& c : opq) {
        auto b = to_buffer(c);
        opq_bytes.insert(opq_bytes.end(), b.begin(), b.end());
    }
    write_file(out / "op_queue_wires.bin", opq_bytes);
    verify(oink, joint, acc, opq);
}

// --- M12: Chonk end-to-end --------------------------------------------------------------------------------
// Dump:   BBREF_NUM_APPS=<n> BBREF_OUT=<dir> ./bin/dsl_tests --gtest_filter='BbRefDump.Chonk'
//         (bb's mock IVC with real recursive kernels at log2_num_gates=5; writes proof_fields.bin,
//         proof.msgpack and the hiding kernel vk)
// Verify: BBREF_IN=<dir with proof_fields.bin [+ proof.msgpack] and vk> ./bin/dsl_tests
// --gtest_filter='BbRefDump.Chonk'
TEST(BbRefDump, Chonk)
{
    const char* in_env = std::getenv("BBREF_IN");
    const char* out_env = std::getenv("BBREF_OUT");
    const char* n_env = std::getenv("BBREF_NUM_APPS");
    if (in_env == nullptr && (out_env == nullptr || n_env == nullptr)) {
        GTEST_SKIP() << "set BBREF_IN, or BBREF_NUM_APPS and BBREF_OUT";
    }
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    bb::srs::init_grumpkin_file_crs_factory(bb::srs::bb_crs_path());
    auto verify = [](const ChonkProof& proof, const std::shared_ptr<MegaZKFlavor::VerificationKey>& vk) {
        ChonkNativeVerifier verifier(std::make_shared<MegaZKFlavor::VKAndHash>(vk));
        return verifier.verify(proof);
    };
    if (in_env != nullptr) {
        std::filesystem::path in(in_env);
        std::ifstream f(in / "vk", std::ios::binary);
        std::vector<uint8_t> vk_bytes((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
        auto vk = std::make_shared<MegaZKFlavor::VerificationKey>(from_buffer<MegaZKFlavor::VerificationKey>(vk_bytes));
        auto proof = ChonkProof::from_field_elements(read_proof(in / "proof_fields.bin"));
        if (std::filesystem::exists(in / "proof.msgpack")) {
            EXPECT_TRUE(ChonkProof::from_file_msgpack((in / "proof.msgpack").string()) == proof)
                << "msgpack proof differs from the field proof";
        }
        EXPECT_TRUE(verify(proof, vk));
        return;
    }
    std::filesystem::path out(out_env);
    std::filesystem::create_directories(out);
    PrivateFunctionExecutionMockCircuitProducer producer(static_cast<size_t>(std::stoul(n_env)));
    Chonk ivc{ producer.circuit_kinds() };
    // BBREF_DUMP_CIRCUITS=1 additionally dumps every circuit's proving instance (polys + VK) for the
    // Rust kernel builder to compare against. Off for RNG-tape runs: the MegaZK dump draws masking.
    const bool dump_circuits = std::getenv("BBREF_DUMP_CIRCUITS") != nullptr;
    for (size_t idx = 0; idx < producer.total_num_circuits; ++idx) {
        const bool is_hiding = ivc.get_num_circuits_accumulated() == ivc.get_num_circuits() - 1;
        auto circuit = producer.create_next_circuit(ivc, is_hiding ? 0 : 5, 0, false);
        const auto kind = ivc.current_kind();
        if (dump_circuits) {
            const auto dir = out / ("circuit_" + std::to_string(idx));
            if (kind == CircuitKind::App) {
                dump_from_builder<MegaAppFlavor>(circuit, dir);
            } else if (kind == CircuitKind::Kernel) {
                dump_from_builder<MegaKernelFlavor>(circuit, dir);
            } else {
                dump_from_builder<MegaZKFlavor>(circuit, dir);
            }
        }
        ivc.accumulate(circuit,
                       PrivateFunctionExecutionMockCircuitProducer::make_circuit_verification_key(kind, circuit));
    }
    auto proof = ivc.prove();
    auto vk = ivc.get_hiding_kernel_vk_and_hash()->vk;
    write_proof(out / "proof_fields.bin", proof.to_field_elements());
    proof.to_file_msgpack((out / "proof.msgpack").string());
    write_file(out / "vk", to_buffer(*vk));
    EXPECT_TRUE(verify(proof, vk));
}

// --- Real-flow per-circuit dumps -------------------------------------------------------------------------
// BBREF_IVC_INPUTS=<ivc-inputs.msgpack> BBREF_OUT=<dir> ./bin/dsl_tests --gtest_filter='BbRefDump.ChonkFlow'
// Mirrors `bb prove --scheme chonk` (PrivateExecutionSteps parse + accumulate with the pinned VKs) and
// dumps every circuit's proving instance. Run with HARDWARE_CONCURRENCY=1 BB_RNG_SEED=<seed> so the
// witness-gap fills and op-queue/masking randomness match a same-seeded bb-ref run (which must also
// build a dump instance before each accumulate to keep the draw ledger aligned).
TEST(BbRefDump, ChonkFlow)
{
    const char* inputs = std::getenv("BBREF_IVC_INPUTS");
    const char* out_env = std::getenv("BBREF_OUT");
    if (inputs == nullptr || out_env == nullptr) {
        GTEST_SKIP() << "set BBREF_IVC_INPUTS and BBREF_OUT";
    }
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    bb::srs::init_grumpkin_file_crs_factory(bb::srs::bb_crs_path());
    std::filesystem::path out(out_env);
    std::filesystem::create_directories(out);
    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(inputs));
    auto ivc = std::make_shared<Chonk>(steps.kinds);
    // BBREF_PLAIN=1 skips the dumps, making this loop exactly `bb prove`'s accumulate; with
    // BB_RNG_TAPE_OUT set (flushed per draw) the printed positions are per-phase draw-ledger marks.
    const bool plain = std::getenv("BBREF_PLAIN") != nullptr;
    const char* tape_path = std::getenv("BB_RNG_TAPE_OUT");
    auto mark = [&](const std::string& label) {
        if (tape_path != nullptr) {
            std::cerr << "[draws] " << label << " " << std::filesystem::file_size(tape_path) / 32 << std::endl;
        }
    };
    for (size_t i = 0; i < steps.folding_stack.size(); ++i) {
        mark("before_build_" + std::to_string(i));
        const acir_format::ProgramMetadata metadata{ .ivc = ivc };
        auto circuit = acir_format::create_circuit<Chonk::ClientCircuit>(steps.folding_stack[i], metadata);
        mark("after_build_" + std::to_string(i));
        const auto dir = out / ("circuit_" + std::to_string(i));
        dispatch_kind(steps.kinds[i], [&]<CircuitKind K>() {
            using FlavorT = flavor_for<K>;
            if (!plain) {
                dump_from_builder<FlavorT>(circuit, dir);
            }
            mark("after_dump_" + std::to_string(i));
            auto vk = from_buffer<std::shared_ptr<typename FlavorT::VerificationKey>>(steps.precomputed_vks[i]);
            ivc->accumulate(circuit, Chonk::CircuitVerificationKey{ vk });
            mark("after_accumulate_" + std::to_string(i));
        });
    }
    auto proof = ivc->prove();
    write_proof(out / "proof_fields.bin", proof.to_field_elements());
}

// --- B2: Ultra recursive verifier ------------------------------------------------------------------------
// BBREF_INNER_PROGRAM=<program.json> BBREF_INNER_WITNESS=<witness.gz> BBREF_OUT=<dir>
//   ./bin/dsl_tests --gtest_filter='BbRefDump.UltraRecursion'
// Proves the inner ACIR program with non-ZK UltraHonk, then builds an outer ULTRA circuit running
// bb's recursive Ultra verifier (UltraRecursiveFlavor over UltraCircuitBuilder, DefaultIO) and dumps
// its instance. Run seeded (HARDWARE_CONCURRENCY=1 BB_RNG_SEED=...): the verifier's batch_mul masks
// points with engine randomness.
TEST(BbRefDump, UltraRecursion)
{
    const char* inner_program = std::getenv("BBREF_INNER_PROGRAM");
    const char* inner_witness = std::getenv("BBREF_INNER_WITNESS");
    const char* out = std::getenv("BBREF_OUT");
    if (inner_program == nullptr || inner_witness == nullptr || out == nullptr) {
        GTEST_SKIP() << "set BBREF_INNER_PROGRAM, BBREF_INNER_WITNESS, BBREF_OUT";
    }
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    auto bytecode = get_bytecode(inner_program);
    auto witness_data = get_bytecode(inner_witness);
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(bytecode), false), {} };
    program.witness = acir_format::witness_buf_to_witness_vector(std::move(witness_data));
    acir_format::ProgramMetadata metadata{ .has_ipa_claim = false };
    auto inner_circuit = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);
    auto inner_instance = std::make_shared<ProverInstance_<UltraFlavor>>(inner_circuit);
    auto inner_vk = std::make_shared<UltraFlavor::VerificationKey>(inner_instance->get_precomputed());
    UltraProver_<UltraFlavor> inner_prover{ inner_instance, inner_vk };
    auto inner_proof = inner_prover.construct_proof();

    using RecursiveFlavor = UltraRecursiveFlavor_<UltraCircuitBuilder>;
    UltraCircuitBuilder outer;
    auto stdlib_vk_and_hash = std::make_shared<typename RecursiveFlavor::VKAndHash>(outer, inner_vk);
    UltraVerifier_<RecursiveFlavor, bb::stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>> verifier{
        stdlib_vk_and_hash
    };
    bb::stdlib::Proof<UltraCircuitBuilder> stdlib_inner_proof(outer, inner_proof);
    auto output = verifier.verify_proof(stdlib_inner_proof);
    bb::stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder> io;
    io.pairing_inputs = output.points_accumulator;
    io.set_public();
    dump_from_builder<UltraFlavor>(outer, out);
}

// --- B3: Ultra recursive verifier with IPA accumulation (RollupIO) ---------------------------------------
// BBREF_OUT=<dir> ./bin/dsl_tests --gtest_filter='BbRefDump.UltraRollupRecursion'
// Inner: a seeded arbitrary Ultra circuit with RollupIO::add_default (random valid IPA claim, proof on
// builder.ipa_proof), proven with UltraFlavor (combined honk+ipa proof). Outer: bb's recursive verifier
// with RollupIO, then the DSL finalize path (single-claim IPA accumulation + RollupIO publish). Run with
// HARDWARE_CONCURRENCY=1 BB_RNG_SEED=<seed>: the inner witnesses, the random IPA claim and the outer
// masked batch_muls all draw from the engine.
TEST(BbRefDump, UltraRollupRecursion)
{
    const char* out = std::getenv("BBREF_OUT");
    if (out == nullptr) {
        GTEST_SKIP() << "set BBREF_OUT";
    }
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    bb::srs::init_grumpkin_file_crs_factory(bb::srs::bb_crs_path());
    UltraCircuitBuilder inner;
    for (size_t i = 0; i < (1 << 6); ++i) {
        fr a = fr::random_element();
        fr b_v = fr::random_element();
        fr c = fr::random_element();
        fr d = a + b_v + c;
        uint32_t a_idx = inner.add_variable(a);
        uint32_t b_idx = inner.add_variable(b_v);
        uint32_t c_idx = inner.add_variable(c);
        uint32_t d_idx = inner.add_variable(d);
        inner.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
    }
    bb::stdlib::recursion::honk::RollupIO::add_default(inner);
    auto inner_instance = std::make_shared<ProverInstance_<UltraFlavor>>(inner);
    auto inner_vk = std::make_shared<UltraFlavor::VerificationKey>(inner_instance->get_precomputed());
    UltraProver_<UltraFlavor> inner_prover{ inner_instance, inner_vk };
    auto inner_proof = inner_prover.construct_proof();

    using RecursiveFlavor = UltraRecursiveFlavor_<UltraCircuitBuilder>;
    UltraCircuitBuilder outer;
    auto stdlib_vk_and_hash = std::make_shared<typename RecursiveFlavor::VKAndHash>(outer, inner_vk);
    UltraVerifier_<RecursiveFlavor, bb::stdlib::recursion::honk::RollupIO> verifier{ stdlib_vk_and_hash };
    bb::stdlib::Proof<UltraCircuitBuilder> stdlib_inner_proof(outer, inner_proof);
    auto output = verifier.verify_proof(stdlib_inner_proof);
    write_proof(std::filesystem::path(out) / "inner_proof.bin", inner_proof);
    write_file(std::filesystem::path(out) / "inner_vk", to_buffer(*inner_vk));
    acir_format::HonkRecursionConstraintsOutput<UltraCircuitBuilder> outputs;
    outputs.update(output, /*update_ipa_data=*/true);
    outputs.finalize(outer, /*is_hn_recursion_constraints=*/false, /*has_ipa_claim=*/true);
    dump_from_builder<UltraFlavor>(outer, out);
}

// --- M13: stdlib programs (gate-exactness of the in-circuit primitives) ---------------------------------
// BBREF_STDLIB=<program> BBREF_OUT=<dir> ./bin/dsl_tests --gtest_filter='BbRefDump.Stdlib'
// Programs: field_ops, poseidon2_hash_<N>, transcript, goblin_batch_mul_<K>, aggregate_multiple_<N>,
// io_app_default, io_kernel_default, io_hiding_default, kernel_io_set, hiding_io_set. Each builds a Mega circuit
// from deterministic values through the stdlib API only; the dump is compared polynomial-for-polynomial in Rust.
namespace stdlib_programs {
using Builder = MegaCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using Curve = stdlib::bn254<Builder>;
using G1 = Curve::Group;
using PairingPointsCt = stdlib::recursion::PairingPoints<Curve>;
using bb::g1;

field_ct w(Builder& b, uint64_t v)
{
    return field_ct(witness_ct(&b, fr(v)));
}
g1::affine_element pt(uint64_t k)
{
    return g1::affine_element(g1::element(g1::affine_element::one()) * fr(k));
}

void field_ops(Builder& b)
{
    field_ct a = w(b, 3), bb_ = w(b, 5), c = w(b, 7);
    field_ct d = a + bb_;
    field_ct e = d * c;
    field_ct f = e - a;
    field_ct g = -f;
    field_ct h = (g + field_ct(11)) * field_ct(2);
    field_ct i = a.madd(bb_, c);
    field_ct j = a.add_two(bb_, c);
    field_ct k = e / bb_;
    field_ct l = c.invert();
    field_ct m = d.pow(5);
    field_ct n = field_ct::accumulate({ a, bb_, c, d, e, field_ct(4), f, g, h, i, j });
    field_ct p = m * field_ct(3) + field_ct(1);
    field_ct r = field_ct(witness_ct(&b, p.get_value()));
    p.assert_equal(r);
    field_ct s = w(b, 0);
    s.assert_is_zero();
    a.assert_is_not_zero();
    (a * bb_).assert_equal(field_ct(15));
    field_ct neg22 = field_ct(witness_ct(&b, -fr(22)));
    field_ct::evaluate_polynomial_identity(a, bb_, c, neg22);
    field_ct neg15 = field_ct(witness_ct(&b, -fr(15)));
    field_ct::evaluate_linear_identity(a, bb_, c, neg15);
    a.create_range_constraint(8);
    e.create_range_constraint(20);
    (d * field_ct(1000)).create_range_constraint(68);
    field_ct t =
        field_ct(witness_ct(&b, fr(uint256_t("0x00000000000000000123456789abcdef0123456789abcdef0123456789abcdef"))));
    auto [lo, hi] = stdlib::split_unique(t, 127);
    field_ct u(9);
    u.convert_constant_to_fixed_witness(&b);
    u.set_public();
    a.set_public();
    (k + l + n + lo + hi).set_public();
}

void poseidon2_hash(Builder& b, size_t n)
{
    std::vector<field_ct> inputs;
    for (size_t i = 0; i < n; ++i) {
        inputs.push_back(w(b, i + 1));
    }
    stdlib::poseidon2<Builder>::hash(inputs).set_public();
}

void transcript(Builder& b)
{
    bb::StdlibTranscript<Builder> t;
    t.send_to_verifier("a", w(b, 42));
    t.add_to_hash_buffer("vk", w(b, 43));
    field_ct c1 = t.get_challenge<field_ct>("c1");
    G1 p = G1::from_witness(&b, pt(7));
    t.send_to_verifier("P", p);
    auto shorts = t.get_short_challenges<field_ct>(std::vector<std::string>{ "s1", "s2" });
    field_ct c2 = t.get_challenge<field_ct>("c2");
    auto powers = t.get_dyadic_powers_of_challenge<field_ct>("gate", 4);
    (c1 + shorts[0] + shorts[1] + c2 + powers[3]).set_public();
}

void goblin_batch_mul(Builder& b, size_t k)
{
    std::vector<G1> points;
    std::vector<field_ct> scalars;
    for (size_t i = 0; i < k; ++i) {
        points.push_back(G1::from_witness(&b, pt(i + 1)));
        scalars.push_back(i == 1 ? field_ct(1) : w(b, i + 3));
    }
    G1 r = G1::batch_mul(points, scalars);
    G1 expected = G1::from_witness(&b, r.get_value());
    r.incomplete_assert_equal(expected);
    if (k >= 2) {
        G1 s = points[0] + points[1];
        G1 d = points[0] - points[1];
        s.set_public();
        d.set_public();
    }
    G1 neg = -points[0];
    neg.set_public();
    (r * scalars[0]).set_public();
    (G1::one(&b) + points[0]).set_public();
}

void aggregate_multiple(Builder& b, size_t n)
{
    std::vector<PairingPointsCt> pps;
    for (size_t i = 0; i < n; ++i) {
        pps.emplace_back(G1::from_witness(&b, pt(2 * i + 1)), G1::from_witness(&b, pt(2 * i + 2)));
    }
    PairingPointsCt agg = PairingPointsCt::aggregate_multiple(pps, /*handle_edge_cases=*/false);
    agg.set_public(&b);
    b.finalize_public_inputs();
}

void kernel_io_set(Builder& b)
{
    stdlib::DataBusDepot<Builder> depot;
    depot.set_app_return_data_commitment(G1::from_witness(&b, pt(5)));
    depot.set_kernel_return_data_commitment(G1::from_witness(&b, pt(6)));
    stdlib::recursion::honk::KernelIO io;
    io.pairing_inputs = PairingPointsCt(G1::from_witness(&b, pt(1)), G1::from_witness(&b, pt(2)));
    io.kernel_return_data = depot.get_kernel_return_data_commitment(b);
    for (size_t i = 0; i < MAX_APPS_PER_KERNEL; ++i) {
        io.app_return_data[i] = depot.get_app_return_data_commitment(b, i);
    }
    io.ecc_op_hash = w(b, 9);
    io.output_hn_accum_hash = w(b, 10);
    io.set_public();
}

void hiding_io_set(Builder& b)
{
    stdlib::recursion::honk::HidingKernelIO<Builder> io;
    io.pairing_inputs = PairingPointsCt(G1::from_witness(&b, pt(1)), G1::from_witness(&b, pt(2)));
    io.kernel_return_data = G1::from_witness(&b, pt(3));
    for (size_t i = 0; i < 4; ++i) {
        io.ecc_op_tables[i] = G1::from_witness(&b, pt(10 + i));
    }
    io.set_public();
}

// --- M16: booleans, conditional selection, Grumpkin points (cycle_group) ---
using cycle_group_ct = stdlib::cycle_group<Builder>;
using cycle_scalar_ct = stdlib::cycle_scalar<Builder>;
using bool_ct = stdlib::bool_t<Builder>;
grumpkin::g1::affine_element gp(uint64_t k)
{
    return grumpkin::g1::affine_element(grumpkin::g1::element(grumpkin::g1::affine_one) * grumpkin::fr(k));
}
bool_ct wb(Builder& b, bool v)
{
    return bool_ct(witness_ct(&b, fr(v ? 1 : 0)));
}

void bool_ops(Builder& b)
{
    bool_ct t = wb(b, true), f = wb(b, false), ct(true);
    bool_ct a1 = t && f, a2 = t || f, a3 = t ^ f, a4 = !t, a5 = a4 && f, a6 = (t == f), a7 = (!t == !f), a8 = t || !f,
            a9 = t && ct, a10 = f || ct, a11 = !f && a2, a12 = a4 ^ !f;
    bool_ct n = a4.normalize();
    (!t).assert_equal(f);
    t.assert_equal(ct);
    a1.assert_equal(a5);
    bool_ct c1 = bool_ct::conditional_assign(t, a1, a2), c2 = bool_ct::conditional_assign(!f, a3, a6),
            c3 = bool_ct::conditional_assign(ct, a1, a2), c4 = bool_ct::conditional_assign(a1, a2, a2);
    field_ct x = w(b, 3), y = w(b, 3), z = w(b, 4);
    bool_ct e1 = (x == y), e2 = (x == z), iz = (x - y).is_zero(), iz2 = (x * field_ct(2) - field_ct(6)).is_zero();
    field_ct s1 = field_ct::conditional_assign(t, x, z), s2 = field_ct::conditional_assign(!t, x, z),
             s3 = field_ct::conditional_assign(ct, x, z), s4 = field_ct::conditional_assign(e2, x, x);
    bool_ct fb = bool_ct(x - field_ct(2));
    field_ct fbf(a4);
    bool_ct fb2 = bool_ct(fbf);
    bool_ct fb3 = bool_ct(field_ct(1));
    field_ct sum = field_ct(a1) + field_ct(a2) + field_ct(a4) + field_ct(c2) + field_ct(e1) + field_ct(iz2) + s1 + s2 +
                   s3 + s4 + field_ct(fb) + field_ct(fb2) + field_ct(fb3) + field_ct(n) + field_ct(a7) + field_ct(a8) +
                   field_ct(a9) + field_ct(a10) + field_ct(a11) + field_ct(a12) + field_ct(c1) + field_ct(c3) +
                   field_ct(c4) + field_ct(e2) + field_ct(iz);
    sum.assert_equal(field_ct(witness_ct(&b, sum.get_value())));
}

void cycle_group_add(Builder& b)
{
    auto p = cycle_group_ct::from_witness(&b, gp(3));
    auto q = cycle_group_ct::from_witness(&b, gp(5));
    auto r = p + q;
    auto s = r - p;
    auto d = p + p;
    auto n = -q;
    auto u = p.unconditional_add(q);
    auto v = r.dbl();
    cycle_group_ct c(gp(7));
    auto pc = p + c;
    auto cp = c - p;
    auto cc = c + cycle_group_ct(gp(9));
    auto ucp = c.unconditional_add(p);
    auto pn = p + n;
    auto qq = q - q;
    auto z = qq + p;
    auto e = cycle_group_ct::from_witness(&b, gp(8));
    r.assert_equal(e);
    auto e2 = cycle_group_ct::from_witness(&b, gp(5));
    s.assert_equal(e2);
    auto e3 = cycle_group_ct::from_witness(&b, gp(6));
    d.assert_equal(e3);
    auto e4 = cycle_group_ct::from_witness(&b, gp(16));
    v.assert_equal(e4);
    z.assert_equal(p);
    auto ca = cycle_group_ct::conditional_assign(wb(b, true), p, q);
    auto cb = cycle_group_ct::conditional_assign(bool_ct(false), p, q);
    field_ct sum = pc.x() + cp.y() + cc.x() + ucp.y() + pn.x() + u.x() + n.y() + ca.x() + cb.y() +
                   field_ct(pn.is_point_at_infinity());
    sum.assert_equal(field_ct(witness_ct(&b, sum.get_value())));
}

void cycle_group_mul(Builder& b, size_t k)
{
    cycle_group_ct one(grumpkin::g1::affine_one);
    std::vector<cycle_group_ct> points;
    std::vector<cycle_scalar_ct> scalars;
    for (size_t i = 0; i < k; ++i) {
        field_ct lo = w(b, 12345 + i), hi = w(b, 67 + i);
        scalars.emplace_back(lo, hi);
        points.push_back(one);
    }
    auto r = cycle_group_ct::batch_mul(points, scalars);
    auto e = cycle_group_ct::from_witness(&b, r.get_value());
    r.assert_equal(e);
}

void cycle_group_mul_witness(Builder& b)
{
    auto p = cycle_group_ct::from_witness(&b, gp(3));
    cycle_scalar_ct s(w(b, 999), w(b, 5));
    cycle_group_ct c(gp(11));
    cycle_scalar_ct cs(grumpkin::fr(13));
    auto r = cycle_group_ct::batch_mul({ p, c }, { s, cs });
    auto e = cycle_group_ct::from_witness(&b, r.get_value());
    r.assert_equal(e);
}

// One compression of a fixed message block onto the SHA-256 IV (MegaApp flavor: it has lookups).
void sha256_block(Builder& b)
{
    static constexpr uint64_t iv[8] = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };
    std::array<field_ct, 8> h;
    std::array<field_ct, 16> in;
    for (size_t i = 0; i < 8; ++i) {
        h[i] = w(b, iv[i]);
    }
    for (size_t i = 0; i < 16; ++i) {
        in[i] = w(b, (i * 0x01010101ULL + 0x61626364ULL) & 0xffffffffULL);
    }
    auto out = stdlib::SHA256<Builder>::sha256_block(h, in);
    for (auto& o : out) {
        auto e = w(b, uint256_t(o.get_value()).data[0]);
        o.assert_equal(e);
    }
}

// Every bigfield operation over secp256r1's base field (MegaApp flavor: it has NNF gates).
void trace_op(const char* label, Builder& b)
{
    if (std::getenv("BBREF_TRACE_GATES") != nullptr) {
        std::cerr << "[bb gates 0 arith " << b.blocks.arithmetic.size() << " nnf " << b.blocks.nnf.size() << "] "
                  << label << std::endl;
    }
}

template <typename B> void wnaf_range_fq_t(B& b)
{
    using fq_ct = stdlib::bigfield<B, ::bb::Bn254FqParams>;
    using FqNative = ::bb::fq;
    fq_ct s = fq_ct::from_witness(&b, FqNative(uint256_t(3, 0, 0, 0)));
    fq_ct sc = fq_ct::from_witness(&b, FqNative(uint256_t(0x123456789abcdefULL, 7, 11, 0)));
    fq_ct r = ((s - 1).sqr() - 1) * ((s - 2).sqr() - 1) * sc;
    r.self_reduce();
}
void wnaf_range_fq(Builder& b)
{
    wnaf_range_fq_t(b);
}

template <typename B> void row_disabling_fq_t(B& b)
{
    auto tr = [&](const char* label) {
        if (std::getenv("BBREF_TRACE_GATES") != nullptr) {
            std::cerr << "[bb gates 0 arith " << b.blocks.arithmetic.size() << " nnf " << b.blocks.nnf.size() << "] "
                      << label << std::endl;
        }
    };
    using fq_ct = stdlib::bigfield<B, ::bb::Bn254FqParams>;
    using FqNative = ::bb::fq;
    std::vector<fq_ct> u;
    for (size_t i = 0; i < 15; ++i) {
        u.push_back(fq_ct::from_witness(&b, FqNative(uint256_t(i * 7 + 3, i + 1, 2 * i + 5, 0))));
        tr("u");
    }
    fq_ct main_factor = RowDisablingPolynomial<fq_ct>::evaluate_at_challenge(u, 15);
    tr("main");
    fq_ct offset_factor = fq_ct(1) - main_factor;
    tr("offset");
    main_factor.self_reduce();
    tr("main_reduced");
    offset_factor.self_reduce();
    tr("offset_reduced");
}
void row_disabling_fq(Builder& b)
{
    row_disabling_fq_t(b);
}
void bigfield_ops(Builder& b)
{
    using Fq = stdlib::secp256r1<Builder>::BaseField;
    using FqNative = ::bb::secp256r1::fq;
    const FqNative a_n(
        uint256_t(0x1234567890abcdefULL, 0xfedcba0987654321ULL, 0x0f0e0d0c0b0a0908ULL, 0x0706050403020100ULL));
    const FqNative c_n(
        uint256_t(0x00000000000000ffULL, 0x1111111111111111ULL, 0x2222222222222222ULL, 0x3333333333333333ULL));
    Fq a = Fq::from_witness(&b, a_n);
    trace_op("a", b);
    Fq c = Fq::from_witness(&b, c_n);
    trace_op("c", b);
    Fq k(uint256_t(0x9999));
    trace_op("k", b);
    bool_ct t = wb(b, true), f = wb(b, false);
    trace_op("t", b);
    Fq s = a + c;
    trace_op("s", b);
    Fq d = a - c;
    trace_op("d", b);
    Fq m = a * c;
    trace_op("m", b);
    Fq q = a / c;
    trace_op("q", b);
    Fq sq = a.sqr();
    trace_op("sq", b);
    Fq ma = a.madd(c, { s });
    trace_op("ma", b);
    Fq mm = Fq::mult_madd({ a, c }, { c, a }, { m });
    trace_op("mm", b);
    Fq dm = Fq::dual_madd(a, c, s, d, { sq });
    trace_op("dm", b);
    Fq msd = Fq::msub_div({ a }, { c }, d, { s });
    trace_op("msd", b);
    Fq cn = m.conditional_negate(t);
    trace_op("cn", b);
    Fq cs = Fq::conditional_assign(f, a, c);
    trace_op("cs", b);
    Fq ka = k * a;
    trace_op("ka", b);
    Fq ak = a + k;
    trace_op("ak", b);
    Fq amk = a - k;
    trace_op("amk", b);
    Fq kq = k / a;
    trace_op("kq", b);
    Fq sm = Fq::sum({ a, c, s, d, m });
    trace_op("sm", b);
    Fq p5 = a.pow(5);
    trace_op("p5", b);
    Fq ng = -a;
    trace_op("ng", b);
    Fq inv = a.invert();
    trace_op("inv", b);
    Fq sa = a.sqradd({ c });
    trace_op("sa", b);
    bool_ct e1 = (a == c);
    trace_op("e1", b);
    bool_ct e2 = (cs == a);
    trace_op("e2", b);
    bool_ct lt = a.is_less_than(Fq::modulus);
    trace_op("lt", b);
    a.assert_is_in_field();
    trace_op("a.assert_is_in_field();", b);
    mm.assert_is_not_equal(m);
    trace_op("mm.assert_is_not_equal(m);", b);
    (inv * a).assert_equal(Fq::one());
    trace_op("(inv * a).assert_equal(Fq::one());", b);
    Fq r = q * c;
    trace_op("r", b);
    r.reduce_mod_target_modulus();
    trace_op("r.reduce_mod_target_modulus();", b);
    r.assert_equal(a);
    trace_op("r.assert_equal(a);", b);
    Fq acc = Fq::sum({ sq, ma, mm, dm, msd, cn, ka, ak, amk, kq, sm, p5, ng, sa });
    trace_op("acc", b);
    acc.assert_zero_if(f);
    trace_op("acc.assert_zero_if(f);", b);
    field_ct out = acc.get_limb(0).element + acc.get_limb(1).element + acc.get_limb(2).element +
                   acc.get_limb(3).element + acc.get_prime_basis_limb() + field_ct(e1) + field_ct(e2) + field_ct(lt);
    trace_op("acc.get_prime_basis_limb() + field_ct(e1", b);
    field_ct e(witness_ct(&b, out.get_value()));
    trace_op("e", b);
    (out - e).assert_is_zero();
    trace_op("(out - e).assert_is_zero();", b);
}

// biggroup over secp256r1: point arithmetic, conditionals, a 2-point 128-bit MSM and a scalar mul.
void biggroup_ops(Builder& b)
{
    using Curve = stdlib::secp256r1<Builder>;
    using G1 = Curve::Group;
    using Fr = Curve::ScalarField;
    using FrNative = ::bb::secp256r1::fr;
    using G1Native = ::bb::secp256r1::g1;
    const G1Native::affine_element p_n(G1Native::one * FrNative(7));
    const G1Native::affine_element q_n(G1Native::one * FrNative(11));
    G1 p = G1::from_witness(&b, p_n);
    G1 q = G1::from_witness(&b, q_n);
    trace_op("points", b);
    bool_ct t = wb(b, true), f = wb(b, false);
    G1 s = p + q;
    trace_op("add", b);
    G1 d = p - q;
    trace_op("sub", b);
    G1 dd = p.dbl();
    trace_op("dbl", b);
    G1 n = -p;
    G1 cn = p.conditional_negate(t);
    G1 cs = G1::conditional_assign(f, p, q);
    trace_op("conditionals", b);
    [[maybe_unused]] auto res = s.validate_on_curve("", false);
    trace_op("validate", b);
    Fr u1 = Fr::from_witness(&b, FrNative(uint256_t(0x1234567890abcdefULL, 0x0fedcba098765432ULL, 0, 0)));
    Fr u2 = Fr::from_witness(&b, FrNative(uint256_t(0xabcdef0123456789ULL, 0x1122334455667788ULL, 0, 0)));
    G1 msm = G1::batch_mul({ p, q }, { u1, u2 }, /*max_num_bits=*/128, /*with_edgecases=*/false);
    trace_op("batch_mul", b);
    G1 sm = p.scalar_mul(u1, 128);
    trace_op("scalar_mul", b);
    G1 sum = s + d + dd + n + cn + cs + msm + sm;
    trace_op("sum", b);
    G1 e = G1::from_witness(&b, sum.get_value());
    sum.incomplete_assert_equal(e);
    trace_op("assert", b);
}

// Non-goblin bn254 biggroup with native field_t scalars: only meaningful on UltraCircuitBuilder
// (on Mega builders bb aliases the bn254 element to the goblin element).
template <typename B> void biggroup_bn254_ops_t(B& b)
{
    using Curve = stdlib::bn254<B>;
    using G1 = Curve::Group;
    using FrS = Curve::ScalarField;
    using witness_u = stdlib::witness_t<B>;
    using bool_u = stdlib::bool_t<B>;
    auto tr = [&](const char* label) {
        if (std::getenv("BBREF_TRACE_GATES") != nullptr) {
            std::cerr << "[bb gates 0 arith " << b.blocks.arithmetic.size() << " nnf " << b.blocks.nnf.size() << "] "
                      << label << std::endl;
        }
    };
    const g1::affine_element p_n(g1::element(g1::affine_element::one()) * fr(7));
    const g1::affine_element q_n(g1::element(g1::affine_element::one()) * fr(11));
    G1 p = G1::from_witness(&b, p_n);
    G1 q = G1::from_witness(&b, q_n);
    tr("points");
    bool_u t = bool_u(witness_u(&b, fr(1)));
    bool_u f = bool_u(witness_u(&b, fr(0)));
    G1 s = p + q;
    G1 d = p - q;
    G1 dd = p.dbl();
    G1 n = -p;
    G1 cn = p.conditional_negate(t);
    G1 cs = G1::conditional_assign(f, p, q);
    [[maybe_unused]] auto res = s.validate_on_curve("", false);
    tr("ops");
    FrS u1 = FrS(witness_u(&b, fr(uint256_t("0abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab"))));
    FrS u2 = FrS(witness_u(&b, fr(uint256_t("00000000000000000000000000000000abcdef0123456789abcdef0123456789"))));
    FrS u3 = FrS(witness_u(&b, fr(uint256_t("00000000000000000000000000000000112233445566778899aabbccddeeff00"))));
    G1 m1 = G1::batch_mul({ p, q }, { u1, u2 }, /*max_num_bits=*/0, /*with_edgecases=*/true);
    tr("batch_mul_edgecases");
    G1 m2 = G1::batch_mul({ p, q }, { u2, u3 }, /*max_num_bits=*/128, /*with_edgecases=*/false);
    tr("batch_mul_small");
    using FqB = typename Curve::BaseField;
    const g1::affine_element one_n = g1::affine_element::one();
    FqB gx(nullptr, uint256_t(one_n.x));
    FqB gy(nullptr, uint256_t(one_n.y));
    G1 const_g(gx, gy);
    G1 m3 = G1::batch_mul({ p, const_g }, { u3, FrS(fr(5)) }, /*max_num_bits=*/0, /*with_edgecases=*/false);
    tr("batch_mul_mixed_constant");
    G1 sm = p.scalar_mul(u1);
    tr("scalar_mul");
    G1 sum = s + d + dd + n + cn + cs + m1 + m2 + m3 + sm;
    G1 e = G1::from_witness(&b, sum.get_value());
    sum.incomplete_assert_equal(e);
    tr("assert");
}

void secp256r1_mul(Builder& b)
{
    using Curve = stdlib::secp256r1<Builder>;
    using G1 = Curve::Group;
    using Fr = Curve::ScalarField;
    using FrNative = ::bb::secp256r1::fr;
    using G1Native = ::bb::secp256r1::g1;
    Fr u1 = Fr::from_witness(
        &b,
        FrNative(
            uint256_t(0x1234567890abcdefULL, 0xfedcba0987654321ULL, 0x0f0e0d0c0b0a0908ULL, 0x0706050403020100ULL)));
    G1 t1 = G1::secp256r1_fixed_base_mul(u1);
    trace_op("fixed_base_mul", b);
    const G1Native::affine_element q_n(G1Native::one * FrNative(11));
    G1 q = G1::from_witness(&b, q_n);
    Fr u2 = Fr::from_witness(
        &b,
        FrNative(
            uint256_t(0xabcdef0123456789ULL, 0x1122334455667788ULL, 0x99aabbccddeeff00ULL, 0x0123456789abcdefULL)));
    auto out = G1::secp256r1_ecdsa_mul(q, u1, u2);
    trace_op("ecdsa_mul", b);
    out.u2_is_acceptable.assert_equal(bool_ct(true));
    G1 e1 = G1::from_witness(&b, t1.get_value());
    t1.incomplete_assert_equal(e1);
    G1 e2 = G1::from_witness(&b, out.result.get_value());
    out.result.incomplete_assert_equal(e2);
}

void ecdsa_r1(Builder& b)
{
    using Curve = stdlib::secp256r1<Builder>;
    using Fq = Curve::BaseField;
    using Fr = Curve::ScalarField;
    using G1 = Curve::Group;
    auto bytes = [&](const char* hex) {
        std::vector<uint8_t> v;
        for (size_t i = 0; i < 64; i += 2) {
            v.push_back(static_cast<uint8_t>(std::stoul(std::string(hex + i, 2), nullptr, 16)));
        }
        return stdlib::byte_array<Builder>(&b, v);
    };
    auto hashed_message = bytes("5566778899aabbccddeeff00112233445566778899aabbccddeeff0011223344");
    auto pub_x_bytes = bytes("471c3e758c4904285bba7e53118ed0f524adeb0757d25bd2f8e7b0d76dfa714c");
    auto pub_y_bytes = bytes("dd520f7aca8a8b917acc37f51de8f0c9bbe3ad858382e702dc25a12d09f7a858");
    auto r = bytes("4a5530b043726fbeebd13c58ebc50dcc944fd60e07b714aac9b57eddc6037a88");
    auto s = bytes("2b0f47eb371a2580242896f996d17e91d6134517572759d4d9729892c8b4dcd0");
    Fq pub_x(pub_x_bytes);
    Fq pub_y(pub_y_bytes);
    G1 public_key(pub_x, pub_y, /*assert_on_curve=*/false);
    bool_ct result = stdlib::ecdsa_verify_signature<Builder, Curve, Fq, Fr, G1>(hashed_message, public_key, { r, s });
    result.assert_equal(bool_ct(true));
}

void keccak_permutation(Builder& b)
{
    std::array<field_ct, 25> state;
    for (size_t i = 0; i < 25; ++i) {
        const uint64_t v = static_cast<uint64_t>(i + 1) * 0x9e3779b97f4a7c15ULL;
        state[i] = field_ct(witness_ct(&b, bb::fr(v)));
    }
    const auto out = stdlib::keccak<Builder>::permutation_opcode(state, &b);
    for (size_t i = 0; i < 25; ++i) {
        out[i].assert_equal(field_ct(witness_ct(&b, out[i].get_value())));
    }
}

void logic_ops(Builder& b)
{
    auto w = [&](uint64_t v) { return field_ct(witness_ct(&b, bb::fr(v))); };
    field_ct a = w(0xdeadbeefULL), bb_ = w(0x12345678ULL);
    field_ct x = stdlib::logic<Builder>::create_logic_constraint(a, bb_, 32, true);
    field_ct y = stdlib::logic<Builder>::create_logic_constraint(a, bb_, 32, false);
    field_ct c = w(0x0123456789abcdefULL), d = w(0xfedcba9876543210ULL);
    field_ct z = stdlib::logic<Builder>::create_logic_constraint(c, d, 64, true);
    field_ct e = w(0xa5ULL), f = w(0x3cULL);
    field_ct g = stdlib::logic<Builder>::create_logic_constraint(e, f, 8, false);
    field_ct k(bb::fr(0x0f));
    field_ct h = stdlib::logic<Builder>::create_logic_constraint(e, k, 8, true);
    field_ct sum = field_ct::accumulate({ x, y, z, g, h });
    sum.assert_equal(field_ct(witness_ct(&b, sum.get_value())));
}

void run(Builder& b, const std::string& name)
{
    auto suffix = [&](const std::string& prefix) { return std::stoul(name.substr(prefix.size())); };
    if (name == "keccak_permutation") {
        keccak_permutation(b);
        return;
    }
    if (name == "logic_ops") {
        logic_ops(b);
        return;
    }
    if (name == "secp256r1_mul") {
        secp256r1_mul(b);
        return;
    }
    if (name == "ecdsa_r1") {
        ecdsa_r1(b);
        return;
    }
    if (name == "biggroup_ops") {
        biggroup_ops(b);
    } else if (name == "bigfield_ops") {
        bigfield_ops(b);
    } else if (name == "row_disabling_fq") {
        row_disabling_fq(b);
    } else if (name == "wnaf_range_fq") {
        wnaf_range_fq(b);
    } else if (name == "sha256_block") {
        sha256_block(b);
    } else if (name == "field_ops") {
        field_ops(b);
    } else if (name == "bool_ops") {
        bool_ops(b);
    } else if (name == "cycle_group_add") {
        cycle_group_add(b);
    } else if (name.starts_with("cycle_group_mul_witness")) {
        cycle_group_mul_witness(b);
    } else if (name.starts_with("cycle_group_mul_")) {
        cycle_group_mul(b, suffix("cycle_group_mul_"));
    } else if (name.starts_with("poseidon2_hash_")) {
        poseidon2_hash(b, suffix("poseidon2_hash_"));
    } else if (name == "transcript") {
        transcript(b);
    } else if (name.starts_with("goblin_batch_mul_")) {
        goblin_batch_mul(b, suffix("goblin_batch_mul_"));
    } else if (name.starts_with("aggregate_multiple_")) {
        aggregate_multiple(b, suffix("aggregate_multiple_"));
    } else if (name == "io_app_default") {
        stdlib::recursion::honk::AppIO::add_default(b);
    } else if (name == "io_kernel_default") {
        stdlib::recursion::honk::KernelIO::add_default(b);
    } else if (name == "io_hiding_default") {
        stdlib::recursion::honk::HidingKernelIO<Builder>::add_default(b);
    } else if (name == "kernel_io_set") {
        kernel_io_set(b);
    } else if (name == "hiding_io_set") {
        hiding_io_set(b);
    } else {
        throw_or_abort("unknown stdlib program " + name);
    }
}
} // namespace stdlib_programs

TEST(BbRefDump, Stdlib)
{
    const char* program = std::getenv("BBREF_STDLIB");
    const char* out = std::getenv("BBREF_OUT");
    if (program == nullptr || out == nullptr) {
        GTEST_SKIP() << "set BBREF_STDLIB, BBREF_OUT";
    }
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    const char* flavor_early = std::getenv("BBREF_FLAVOR");
    if (flavor_early != nullptr && std::string(flavor_early) == "ultra") {
        UltraCircuitBuilder ultra_builder;
        if (std::string(program) == "biggroup_bn254_ops") {
            stdlib_programs::biggroup_bn254_ops_t(ultra_builder);
        } else if (std::string(program) == "row_disabling_fq") {
            stdlib_programs::row_disabling_fq_t(ultra_builder);
        } else if (std::string(program) == "wnaf_range_fq") {
            stdlib_programs::wnaf_range_fq_t(ultra_builder);
        } else {
            throw_or_abort("unknown ultra stdlib program " + std::string(program));
        }
        ASSERT_FALSE(ultra_builder.failed()) << ultra_builder.err();
        dump_from_builder<UltraFlavor>(ultra_builder, out);
        return;
    }
    MegaCircuitBuilder builder{ std::make_shared<ECCOpQueue>() };
    stdlib_programs::run(builder, program);
    ASSERT_FALSE(builder.failed()) << builder.err();
    const char* flavor = std::getenv("BBREF_FLAVOR");
    if (flavor != nullptr && std::string(flavor) == "app") {
        dump_from_builder<MegaAppFlavor>(builder, out);
    } else {
        dump_from_builder<MegaKernelFlavor>(builder, out);
    }
}

// --- M16: whole Noir circuits -----------------------------------------------------------------------------
// BBREF_PROGRAM=<program.json> BBREF_KIND=app|kernel|hiding BBREF_OUT=<dir> ./bin/dsl_tests
// --gtest_filter='BbRefDump.AcirMega' The Mega circuit of a Noir artifact in write-VK mode (kernels against the mocked
// IVC state), dumped for Rust's gate-level diff.
TEST(BbRefDump, AcirMega)
{
    const char* program = std::getenv("BBREF_PROGRAM");
    const char* kind = std::getenv("BBREF_KIND");
    const char* out = std::getenv("BBREF_OUT");
    if (program == nullptr || kind == nullptr || out == nullptr) {
        GTEST_SKIP() << "set BBREF_PROGRAM, BBREF_KIND, BBREF_OUT";
    }
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    auto bytecode = get_bytecode(program);
    acir_format::AcirProgram prog{ acir_format::circuit_buf_to_acir_format(std::move(bytecode), true), {} };
    auto builder = acir_format::create_circuit<MegaCircuitBuilder>(prog, acir_format::ProgramMetadata{});
    const std::string k(kind);
    if (k == "app") {
        dump_from_builder<MegaAppFlavor>(builder, out);
    } else if (k == "kernel") {
        dump_from_builder<MegaKernelFlavor>(builder, out);
    } else {
        dump_from_builder<MegaZKFlavor>(builder, out);
    }
}

// Write-VK instance dump of an ACIR program on UltraCircuitBuilder (backend recursion circuits):
// BBREF_PROGRAM (program.json), BBREF_IPA=1 for --ipa_accumulation, BBREF_OUT. Witness-free, so
// witness polynomials contain mock randomness; only precomputed + sigma/id are comparable.
TEST(BbRefDump, UltraWriteVk)
{
    const char* out = std::getenv("BBREF_OUT");
    const char* program_path = std::getenv("BBREF_PROGRAM");
    if (out == nullptr || program_path == nullptr) {
        GTEST_SKIP() << "set BBREF_OUT and BBREF_PROGRAM";
    }
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    bb::srs::init_grumpkin_file_crs_factory(bb::srs::bb_crs_path());
    auto bytecode = get_bytecode(program_path);
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(bytecode), false), {} };
    acir_format::ProgramMetadata metadata{ .has_ipa_claim = std::getenv("BBREF_IPA") != nullptr };
    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);
    dump_from_builder<UltraFlavor>(builder, out);
}
