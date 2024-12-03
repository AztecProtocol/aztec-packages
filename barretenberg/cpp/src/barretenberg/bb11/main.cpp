#pragma GCC diagnostic ignored "-Wunused-parameter"

#include "barretenberg/bb11/CLI11.hpp"
#include "barretenberg/bb11/api.hpp"
// #include "barretenberg/bb11/api_client_ivc.hpp"
#include "barretenberg/bb11/file_io.hpp"
// #include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/log.hpp"
// #include "barretenberg/common/benchmark.hpp"
// #include "barretenberg/common/map.hpp"
// #include "barretenberg/common/serialize.hpp"
// #include "barretenberg/common/timer.hpp"
// #include "barretenberg/constants.hpp"
// #include "barretenberg/dsl/acir_format/acir_format.hpp"
// #include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
// #include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
// #include "barretenberg/dsl/acir_proofs/acir_composer.hpp"
// #include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
// #include "barretenberg/honk/proof_system/types/proof.hpp"
// #include "barretenberg/numeric/bitop/get_msb.hpp"
// #include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"
// #include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
// #include "barretenberg/serialize/cbind.hpp"
// #include "barretenberg/srs/global_crs.hpp"
// #include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
// #include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
// #include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"
// #include "barretenberg/vm/avm/trace/public_inputs.hpp"

// #ifndef DISABLE_AZTEC_VM
// #include "barretenberg/vm/avm/generated/flavor.hpp"
// #include "barretenberg/vm/avm/trace/common.hpp"
// #include "barretenberg/vm/avm/trace/execution.hpp"
// #include "barretenberg/vm/aztec_constants.hpp"
// #include "barretenberg/vm/stats.hpp"
// #endif

using namespace bb;

const std::filesystem::path current_path = std::filesystem::current_path();
const auto current_dir = current_path.filename().string();

// // Initializes without loading G1
// // TODO(https://github.com/AztecProtocol/barretenberg/issues/811) adapt for grumpkin
// acir_proofs::AcirComposer verifier_init()
// {
//     acir_proofs::AcirComposer acir_composer(0, verbose_logging);
//     auto g2_data = get_bn254_g2_data(CRS_PATH);
//     srs::init_crs_factory({}, g2_data);
//     return acir_composer;
// }

// std::string to_json(std::vector<bb::fr>& data)
// {
//     return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
// }

// std::string vk_to_json(std::vector<bb::fr> const& data)
// {
//     // We need to move vk_hash to the front...
//     std::vector<bb::fr> rotated(data.begin(), data.end() - 1);
//     rotated.insert(rotated.begin(), data.at(data.size() - 1));

//     return format("[", join(map(rotated, [](auto fr) { return format("\"", fr, "\""); })), "]");
// }

// bool flag_present(std::vector<std::string>& args, const std::string& flag)
// {
//     return std::find(args.begin(), args.end(), flag) != args.end();
// }

// std::string get_option(std::vector<std::string>& args, const std::string& option, const std::string& defaultValue)
// {
//     auto itr = std::find(args.begin(), args.end(), option);
//     return (itr != args.end() && std::next(itr) != args.end()) ? *(std::next(itr)) : defaultValue;
// }

int main(int argc, char* argv[])
{
    ;
    std::string name = "Barretenberg\nYour favo(u)rite zkSNARK library written in C++, a perfectly good computer "
                       "programming language.";
    CLI::App app{ name };
    argv = app.ensure_utf8(argv);

    // std::string filename{ "default" };
    // std::string file_ext{ "zip" };
    // app.add_option("-f,--file", filename, "the name of a file")->envname("FILE")->check(CLI::ExistingFile);
    // app.add_option("--ext", file_ext, "the extension type of a file")
    //     ->needs("--file")
    //     ->check(CLI::IsMember({ "zip", "jpeg" }));

    // bool myflag{ false };
    // app.add_flag("--myflag", myflag, "this is the flag I added, wdyt?");

    // CLI::App* prove_sub = app.add_subcommand("prove", "prove some stuff");
    // prove_sub->add_option("--yoohoo", filename, "overwrite whatever value is set by --file")->required();

    CLI11_PARSE(app, argc, argv);

    // info("filename is: ", filename);
    // info("myflag is: ", myflag);
    // info("fext is: ", file_ext);
}
