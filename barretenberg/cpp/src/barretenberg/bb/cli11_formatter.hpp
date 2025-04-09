#include "barretenberg/bb/deps/cli11.hpp"
#include <iomanip>
#include <sstream>

namespace bb {

class Formatter : public CLI::Formatter {
  public:
    Formatter() { column_width_ = 25; }

    std::string make_option_opts(const CLI::Option* opt) const override
    {
        std::stringstream out;
        if (!opt->get_envname().empty()) {
            out << " [" << opt->get_envname() << "]";
        }
        return out.str();
    }

    std::string make_option_desc(const CLI::Option* opt) const override
    {
        const size_t wrap_width = 60;
        std::stringstream out;

        if (opt->get_required()) {
            out << "\e[3mREQUIRED\e[0m ";
        }
        std::string desc = opt->get_description();
        wrap_text(out, desc, wrap_width);
        CLI::Validator* is_member_validator = get_validator(const_cast<CLI::Option*>(opt), "is_member");
        if (is_member_validator) {
            out << "\n";
            std::string options = is_member_validator->get_description();
            wrap_text(out, "Options: " + replace(options, ",", ", "), wrap_width);
        }
        return out.str();
    }

    std::string make_subcommand(const CLI::App* sub) const override
    {
        const size_t left_col_width = 25;
        const size_t wrap_width = 60;
        std::stringstream out;
        std::string name = sub->get_display_name(true) + (sub->get_required() ? " " + get_label("REQUIRED") : "");
        out << std::setw(left_col_width) << std::left << name;
        std::string desc = sub->get_description();
        std::istringstream iss(desc);
        std::string word;
        size_t current_line_length = 0;
        std::string indent(left_col_width, ' ');
        bool first_word = true;
        while (iss >> word) {
            if (!first_word && current_line_length + word.size() + 1 > wrap_width) {
                out << "\n" << indent;
                current_line_length = 0;
            } else if (!first_word) {
                out << " ";
                current_line_length++;
            }
            out << word;
            current_line_length += word.size();
            first_word = false;
        }
        out << "\n";
        return out.str();
    }

    std::string make_help(const CLI::App* app, std::string name, CLI::AppFormatMode mode) const override
    {
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
    }

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
} // namespace bb
