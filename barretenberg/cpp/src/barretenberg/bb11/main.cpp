#pragma GCC diagnostic ignored "-Wunused-parameter"

#include "barretenberg/bb11/CLI11.hpp"
#include "barretenberg/bb11/api.hpp"
#include "barretenberg/bb11/file_io.hpp"
#include "barretenberg/common/log.hpp"

using namespace bb;

class Formatter : public CLI::Formatter {
  public:
    Formatter() = default;

    std::string make_option_opts(const CLI::Option* opt) const override
    {
        std::stringstream out;

        // Add environment variable if present
        if (!opt->get_envname().empty()) {
            out << " [" << opt->get_envname() << "]";
        }

        return out.str();
    }

    std::string make_option_desc(const CLI::Option* opt) const override
    {
        const size_t wrap_width = 60;
        std::stringstream out;

        // WORKTODO: do similar for deprecated
        if (opt->get_required()) {
            out << "\e[3mREQUIRED\e[0m ";
        }

        // Main description
        std::string desc = opt->get_description();

        // Add acceptable options if IsMember validator is used
        CLI::Validator* is_member_validator = get_validator(const_cast<CLI::Option*>(opt), "is_member");

        wrap_text(out, desc, wrap_width);

        if (is_member_validator) {
            out << "\n";
            std::string options = is_member_validator->get_description();
            wrap_text(out, "Options: " + replace(options, ",", ", "), wrap_width);
        }

        return out.str();
    }

    std::string make_help(const CLI::App* app, std::string name, CLI::AppFormatMode mode) const override
    {
        // Use default formatting for the app's name and description
        std::stringstream out;
        if (mode == CLI::AppFormatMode::Normal) {
            out << CLI::Formatter::make_help(app, name, mode);
        }
        return out.str();
    }

  private:
    static void wrap_text(std::ostream& out, const std::string& text, size_t width)
    {
        std::istringstream words(text);
        std::string word;
        size_t line_length = 0;

        while (words >> word) {
            if (line_length + word.length() + 1 > width) {
                out << "\n";
                line_length = 0;
            }
            if (line_length > 0) {
                out << " ";
                line_length++;
            }
            out << word;
            line_length += word.length();
        }
    }

    CLI::Validator* get_validator(CLI::Option* opt, const std::string& name) const
    {
        CLI::Validator* result;
        try {
            result = opt->get_validator(name);
        } catch (const CLI::OptionNotFound& err) {
            result = nullptr;
        }
        return result;
    };

    std::string replace(std::string& in, const std::string& pat, const std::string& rep) const
    {
        size_t pos = 0;
        while ((pos = in.find(pat, pos)) != std::string::npos) {
            in.replace(pos, pat.size(), rep);
            pos += rep.size();
        }
        return in;
    }
};

int main(int argc, char* argv[])
{
    std::string name = "Barretenberg\nYour favo(u)rite zkSNARK library written in C++, a perfectly good computer "
                       "programming language.";
    CLI::App app{ name };
    argv = app.ensure_utf8(argv);
    app.formatter(std::make_shared<Formatter>());

    API::Flags flags;

    app.add_flag("--verbose, -v", flags.verbose, "Output all logs to stderr.");
    // WORKTODO: name
    CLI::Option* scheme_option =
        app.add_option(
               "--scheme, -s",
               flags.scheme,
               "The type of proof to be constructed. This can specify a proving system, an accumulation scheme, or "
               "a particular type of circuit to be constructed and proven for some implicit scheme.")
            ->envname("BB_SCHEME")
            ->check(CLI::IsMember({ "client_ivc", "avm", "tube", "ultra_honk", "ultra_keccak_honk", "ultra_plonk" })
                        .name("is_member"));

    // WORKTODO: Path creation logic already handled
    std::filesystem::path crs_path = []() {
        char* home = std::getenv("HOME");
        std::filesystem::path base = home != nullptr ? std::filesystem::path(home) : "./";
        return base / ".bb-crs";
    }();
    app.add_option("--crs_dir, -c", "Path CRS directory. Missing CRS files will be retrieved from the internet.")
        ->check(CLI::ExistingDirectory);

    /*******************************************************
     * Subcommnd: prove
     *******************************************************/
    CLI::App* prove = app.add_subcommand("prove", "Generate a proof.");

    prove->needs(scheme_option);

    std::filesystem::path bytecode_path{ "./target/program.json" };
    // WORKTODO: documentation of structure (JSON or msgpack of bytecodes; bytecodes are encoded...)
    // WORKTODO: fine-grained validation?
    // WORKTODO: bytecode path is a bad name since bytecode is sometimes actually just a field in the ACIR?
    prove->add_option("--bytecode_path, -b", bytecode_path, "Path to ACIR bytecode generated by Noir.")
        ->check(CLI::ExistingFile);

    // WORKTODO: documentation of structure (JSON or msgpack of bytecodes; bytecodes are encoded...)
    std::filesystem::path witness_path{ "./target/witness.gz" };
    prove->add_option("--witness_path, -w", witness_path, "Path to partial witness generated by Noir.")
        ->check(CLI::ExistingFile);

    std::filesystem::path output_dir{ "./target" };
    prove->add_option("--output_dir, -o", output_dir, "Directory where the proof will be stored.")
        ->check(CLI::ExistingDirectory);

    auto* input_type_option =
        prove
            ->add_option("--input_type",
                         flags.input_type,
                         "Is the input a single circuit, a compile-time stack or a run-time stack?")
            ->check(CLI::IsMember({ "single_circuit", "compiletime_stack", "runtime_stack" }).name("is_member"));
    // Eventually we should uniformize this the correct proving mode is detected from the inputs.
    CLI::deprecate_option(input_type_option);

    prove
        ->add_option("--output_type", flags.output_type, "Format of the output.")
        // These options currently exist. Probably it's a good idea to just settle on one (fields_msgpack imo) but I'm
        // less convinced this is the right solution than I am in the input_type case.
        ->check(CLI::IsMember({ "bytes", "fields", "bytes_and_fields", "fields_msgpack" }));

    prove->add_flag("--verify", "Verify the proof natively, resulting in a boolean output. Useful for testing.");

    /*******************************************************
     * Subcommnd: verify
     *******************************************************/

    CLI11_PARSE(app, argc, argv);
}
