#include "barretenberg/vm2/tooling/debugger.hpp"

#include <iostream>
#include <optional>
#include <regex>
#include <string>
#include <vector>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/lib/trace_conversion.hpp"

namespace bb::avm2 {
namespace {

std::vector<std::string> get_command()
{
    std::string line;
    std::getline(std::cin, line);
    // Split the line into words.
    return bb::detail::split_and_trim(line, ' ');
}

std::string str_replace(const std::string& s, const std::string& search, const std::string& replace)
{
    size_t pos = 0;
    std::string res = s;
    while ((pos = res.find(search, pos)) != std::string::npos) {
        res.replace(pos, search.length(), replace);
        pos += replace.length();
    }
    return res;
}

std::string to_binary(uint64_t n, bool leading_zeroes = true)
{
    std::string result;
    for (int i = 0; i < 64; ++i) {
        result = ((n & 1) ? "1" : "0") + result;
        n >>= 1;
    }
    if (!leading_zeroes) {
        size_t first_one = result.find('1');
        if (first_one != std::string::npos) {
            result = result.substr(first_one);
        } else {
            result = "0";
        }
    }
    return result;
}

void help()
{
    std::cout << "Commands:" << std::endl;
    std::cout << "  ' - increment row" << std::endl;
    std::cout << "  , - decrement row" << std::endl;
    std::cout << "  @<row> - jump to row" << std::endl;
    std::cout << "  .<column_regex> [...column_regex] - print column values" << std::endl;
    std::cout << "  /set <column> <value> - set column" << std::endl;
    std::cout << "  /prefix <column_prefix> - set column prefix" << std::endl;
    std::cout << "  /noprefix - clear column prefix" << std::endl;
    std::cout << "  /testrelation <relation_name> [subrelation_name_or_number] - test relation" << std::endl;
    std::cout << "  exit, e, q - exit" << std::endl;
}

} // namespace

void InteractiveDebugger::run(uint32_t starting_row)
{
    row = starting_row;
    std::cout << "Entering interactive debugging mode at row " << row << "..." << std::endl;
    while (true) {
        // Print prompt with current row.
        std::cout << this->row << "> ";
        auto command = get_command();
        if (command.empty()) {
            continue;
        }
        if (command[0] == "'") {
            row++;
        } else if (command[0] == ",") {
            if (row > 0) {
                row--;
            } else {
                std::cout << "Cannot decrement row below 0." << std::endl;
            }
        } else if (command[0].starts_with("@")) {
            row = static_cast<uint32_t>(std::stoi(command[0].substr(1)));
        } else if (command[0] == "exit" || command[0] == "e" || command[0] == "q") {
            break;
        } else if (command[0] == "/set" || command[0] == "/s") {
            if (command.size() != 3) {
                std::cout << "Usage: /set <column> <value>" << std::endl;
            } else {
                set_column(command[1], command[2]);
            }
        } else if (command[0] == "/prefix" || command[0] == "/p") {
            if (command.size() != 2) {
                std::cout << "Usage: /prefix <column_prefix>" << std::endl;
            } else {
                prefix = command[1];
            }
        } else if (command[0] == "/noprefix" || command[0] == "/np") {
            prefix = "";
        } else if (command[0] == "/testrelation" || command[0] == "/tr") {
            if (command.size() != 2 && command.size() != 3) {
                std::cout << "Usage: /testrelation <relation_name> [subrelation_name_or_number]" << std::endl;
            } else {
                test_relation(command[1], command.size() == 3 ? std::make_optional(command[2]) : std::nullopt);
            }
        } else if (command[0].starts_with(".")) {
            // Remove dot from first column name.
            command[0].erase(0, 1);
            // Print columns.
            print_columns(command);
        } else {
            help();
        }
    }
}

void InteractiveDebugger::print_columns(const std::vector<std::string>& regexes)
{
    bool found = false;
    std::string joined_regex;
    for (const auto& str : regexes) {
        joined_regex += prefix + str_replace(str, "'", "_shift") + "|";
    }
    joined_regex.pop_back(); // Remove trailing '|'.
    std::regex re;
    try {
        re.assign(joined_regex);
    } catch (std::regex_error& e) {
        std::cout << "Invalid regex: " << e.what() << std::endl;
        return;
    }
    for (size_t i = 0; i < COLUMN_NAMES.size(); ++i) {
        if (std::regex_match(COLUMN_NAMES[i], re)) {
            auto val = trace.get_column_or_shift(static_cast<ColumnAndShifts>(i), row);
            std::cout << COLUMN_NAMES[i] << ": " << field_to_string(val);
            // If the value is small enough, print it as decimal and binary.
            if (val == FF(static_cast<uint64_t>(val))) {
                uint64_t n = static_cast<uint64_t>(val);
                std::cout << " (" << n << ", " << to_binary(n, /*leading_zeroes=*/false) << "b)";
            }
            std::cout << std::endl;
            found = true;
        }
    }
    if (!found) {
        std::cout << "No columns matched: " << joined_regex << std::endl;
    }
}

void InteractiveDebugger::set_column(const std::string& column_name, const std::string& value)
{
    std::string final_name = prefix + column_name;
    for (size_t i = 0; i < COLUMN_NAMES.size(); ++i) {
        // We match both names, for copy-pasting ease.
        if (COLUMN_NAMES[i] == final_name || COLUMN_NAMES[i] == column_name) {
            trace.set(static_cast<Column>(i), row, std::stoi(value));
            std::cout << "Column " << COLUMN_NAMES[i] << " set to value " << value << std::endl;
            return;
        }
    }
    std::cout << "Column " << column_name << " not found." << std::endl;
}

void InteractiveDebugger::test_relation(const std::string& relation_name, std::optional<std::string> subrelation_name)
{
    bool found = false;
    bool failed = false;

    bb::constexpr_for<0, std::tuple_size_v<typename AvmFlavor::MainRelations>, 1>([&]<size_t i>() {
        using Relation = std::tuple_element_t<i, typename AvmFlavor::MainRelations>;

        if (Relation::NAME != relation_name) {
            return;
        }
        found = true;

        // TODO(fcarreiro): use check_relation.
        typename Relation::SumcheckArrayOfValuesOverSubrelations result{};
        Relation::accumulate(result, tracegen::get_full_row(trace, row), {}, 1);
        for (size_t j = 0; j < result.size(); ++j) {
            if (!result[j].is_zero() &&
                (!subrelation_name || Relation::get_subrelation_label(j) == *subrelation_name)) {
                std::cout << format("Relation ",
                                    Relation::NAME,
                                    ", subrelation ",
                                    Relation::get_subrelation_label(j),
                                    " failed at row ",
                                    row)
                          << std::endl;
                failed = true;
                return;
            }
        }
    });

    if (!found) {
        std::cout << "Relation " << relation_name << " not found." << std::endl;
    } else if (!failed) {
        std::cout << "Relation " << relation_name << " ("
                  << (subrelation_name.has_value() ? *subrelation_name : "all subrelations") << ")"
                  << " passed!" << std::endl;
    }
}

} // namespace bb::avm2
