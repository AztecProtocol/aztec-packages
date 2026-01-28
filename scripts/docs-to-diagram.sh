#!/bin/bash
# docs-to-diagram.sh - Convert documentation to diagrams using Claude + Mermaid
#
# This script provides a pipeline for converting documentation text into
# well-formed PNG/SVG diagrams using a two-step process:
# 1. Claude analyzes documentation → outputs structured Mermaid syntax
# 2. Mermaid CLI renders → outputs PNG/SVG images
#
# Usage:
#   ./docs-to-diagram.sh <command> [options]
#
# Commands:
#   render    Render a .mmd file to PNG/SVG
#   prompt    Generate a Claude prompt for documentation conversion
#   help      Show this help message
#
# Examples:
#   # Render a Mermaid file to PNG
#   ./docs-to-diagram.sh render diagram.mmd output.png
#
#   # Render with custom dimensions
#   ./docs-to-diagram.sh render diagram.mmd output.png --width 1200 --height 800
#
#   # Generate SVG instead of PNG
#   ./docs-to-diagram.sh render diagram.mmd output.svg
#
#   # Generate prompt for Claude to convert documentation
#   ./docs-to-diagram.sh prompt docs/my-feature.md
#
#   # Generate prompt with specific diagram type
#   ./docs-to-diagram.sh prompt docs/my-feature.md --type sequence

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/mermaid-config.json"

# Default values
WIDTH=1200
HEIGHT=800
BACKGROUND="white"
DIAGRAM_TYPE="auto"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_error() {
    echo -e "${RED}Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_info() {
    echo -e "${BLUE}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

check_mmdc() {
    if ! command -v mmdc &> /dev/null; then
        print_error "Mermaid CLI (mmdc) is not installed."
        echo ""
        echo "Install it with:"
        echo "  npm install -g @mermaid-js/mermaid-cli"
        echo ""
        echo "Or with yarn:"
        echo "  yarn global add @mermaid-js/mermaid-cli"
        exit 1
    fi
}

show_help() {
    cat << 'EOF'
docs-to-diagram.sh - Convert documentation to diagrams using Claude + Mermaid

USAGE:
    ./docs-to-diagram.sh <command> [options]

COMMANDS:
    render <input.mmd> <output.png|svg> [options]
        Render a Mermaid diagram file to PNG or SVG

        Options:
            --width, -w <pixels>     Output width (default: 1200)
            --height, -H <pixels>    Output height (default: 800)
            --background, -b <color> Background color (default: white)
            --config, -c <file>      Custom Mermaid config file

    prompt <input.md> [options]
        Generate a Claude prompt for converting documentation to Mermaid

        Options:
            --type, -t <type>        Diagram type hint (auto, flowchart, sequence,
                                     architecture, state, er)
            --output, -o <file>      Save prompt to file instead of stdout

    batch <directory> [options]
        Render all .mmd files in a directory

        Options:
            --format, -f <png|svg>   Output format (default: png)
            --recursive, -r          Process subdirectories

    validate <input.mmd>
        Check if a Mermaid file is valid syntax

    help
        Show this help message

EXAMPLES:
    # Basic render
    ./docs-to-diagram.sh render diagram.mmd output.png

    # Render with custom size
    ./docs-to-diagram.sh render diagram.mmd output.png -w 1600 -H 1200

    # Generate prompt for documentation
    ./docs-to-diagram.sh prompt docs/architecture.md

    # Generate prompt for sequence diagram
    ./docs-to-diagram.sh prompt docs/api-flow.md --type sequence

    # Batch render all diagrams
    ./docs-to-diagram.sh batch docs/diagrams/ --format svg

WORKFLOW:
    1. Write or identify documentation that needs a diagram
    2. Run: ./docs-to-diagram.sh prompt your-doc.md > prompt.txt
    3. Use the prompt with Claude to generate Mermaid syntax
    4. Save Claude's output to a .mmd file
    5. Run: ./docs-to-diagram.sh render diagram.mmd output.png
    6. Review and iterate as needed

DIAGRAM TYPES:
    flowchart   - Process flows, decision trees, algorithms
    sequence    - Interactions over time, API calls, message passing
    architecture - Component relationships, system design (graph LR)
    state       - State machines, lifecycle diagrams
    er          - Entity relationships, data models

EOF
}

render_diagram() {
    local input_file=""
    local output_file=""
    local custom_config=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --width|-w)
                WIDTH="$2"
                shift 2
                ;;
            --height|-H)
                HEIGHT="$2"
                shift 2
                ;;
            --background|-b)
                BACKGROUND="$2"
                shift 2
                ;;
            --config|-c)
                custom_config="$2"
                shift 2
                ;;
            -*)
                print_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "$input_file" ]]; then
                    input_file="$1"
                elif [[ -z "$output_file" ]]; then
                    output_file="$1"
                else
                    print_error "Unexpected argument: $1"
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # Validate arguments
    if [[ -z "$input_file" ]]; then
        print_error "Input file required"
        echo "Usage: ./docs-to-diagram.sh render <input.mmd> <output.png|svg>"
        exit 1
    fi

    if [[ ! -f "$input_file" ]]; then
        print_error "Input file not found: $input_file"
        exit 1
    fi

    if [[ -z "$output_file" ]]; then
        # Default output: same name with .png extension
        output_file="${input_file%.mmd}.png"
    fi

    check_mmdc

    # Build mmdc command
    local mmdc_args=(-i "$input_file" -o "$output_file" -w "$WIDTH" -H "$HEIGHT" -b "$BACKGROUND")

    # Add config file if available
    if [[ -n "$custom_config" && -f "$custom_config" ]]; then
        mmdc_args+=(-c "$custom_config")
    elif [[ -f "$CONFIG_FILE" ]]; then
        mmdc_args+=(-c "$CONFIG_FILE")
    fi

    print_info "Rendering: $input_file → $output_file"

    if mmdc "${mmdc_args[@]}"; then
        print_success "Generated: $output_file"
    else
        print_error "Failed to render diagram"
        exit 1
    fi
}

generate_prompt() {
    local input_file=""
    local output_file=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --type|-t)
                DIAGRAM_TYPE="$2"
                shift 2
                ;;
            --output|-o)
                output_file="$2"
                shift 2
                ;;
            -*)
                print_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "$input_file" ]]; then
                    input_file="$1"
                else
                    print_error "Unexpected argument: $1"
                    exit 1
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$input_file" ]]; then
        print_error "Input file required"
        echo "Usage: ./docs-to-diagram.sh prompt <input.md> [--type <type>]"
        exit 1
    fi

    if [[ ! -f "$input_file" ]]; then
        print_error "Input file not found: $input_file"
        exit 1
    fi

    local doc_content
    doc_content=$(cat "$input_file")

    local type_hint=""
    case "$DIAGRAM_TYPE" in
        flowchart)
            type_hint="Use \`flowchart TD\` (top-down) or \`flowchart LR\` (left-right) for this process/decision flow."
            ;;
        sequence)
            type_hint="Use \`sequenceDiagram\` for this interaction/message flow."
            ;;
        architecture)
            type_hint="Use \`graph LR\` with subgraphs for this architecture/component diagram."
            ;;
        state)
            type_hint="Use \`stateDiagram-v2\` for this state machine."
            ;;
        er)
            type_hint="Use \`erDiagram\` for this entity-relationship diagram."
            ;;
        auto|*)
            type_hint="Choose the most appropriate diagram type based on the content."
            ;;
    esac

    local prompt
    prompt="You are a documentation-to-diagram converter. Analyze the following documentation
and create a Mermaid diagram that visualizes the described process/architecture/flow.

**Rules:**
1. Output ONLY valid Mermaid syntax, no explanations or markdown code fences
2. Use appropriate diagram type:
   - \`flowchart TD\` for processes/decisions (top-down)
   - \`flowchart LR\` for horizontal flows (left-right)
   - \`sequenceDiagram\` for interactions over time
   - \`graph LR\` for architecture/component relationships
   - \`stateDiagram-v2\` for state machines
   - \`erDiagram\` for data relationships
3. Keep labels concise but descriptive
4. Use meaningful node IDs (e.g., \`userWallet\` not \`A\`)
5. Group related elements with subgraphs where appropriate
6. Use appropriate arrow styles:
   - \`-->\` for normal flow
   - \`-.->\` for optional/async
   - \`==>\` for important/highlighted
7. Add notes or comments sparingly for clarity

**Diagram type hint:** ${type_hint}

**Documentation to convert:**
<documentation>
${doc_content}
</documentation>

Output the Mermaid diagram:"

    if [[ -n "$output_file" ]]; then
        echo "$prompt" > "$output_file"
        print_success "Prompt saved to: $output_file"
    else
        echo "$prompt"
    fi
}

batch_render() {
    local directory=""
    local format="png"
    local recursive=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --format|-f)
                format="$2"
                shift 2
                ;;
            --recursive|-r)
                recursive=true
                shift
                ;;
            -*)
                print_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "$directory" ]]; then
                    directory="$1"
                else
                    print_error "Unexpected argument: $1"
                    exit 1
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$directory" ]]; then
        print_error "Directory required"
        echo "Usage: ./docs-to-diagram.sh batch <directory> [--format png|svg] [--recursive]"
        exit 1
    fi

    if [[ ! -d "$directory" ]]; then
        print_error "Directory not found: $directory"
        exit 1
    fi

    check_mmdc

    local find_args=("$directory")
    if [[ "$recursive" == false ]]; then
        find_args+=(-maxdepth 1)
    fi
    find_args+=(-name "*.mmd" -type f)

    local count=0
    local failed=0

    while IFS= read -r mmd_file; do
        local output_file="${mmd_file%.mmd}.${format}"
        print_info "Rendering: $mmd_file"

        if render_diagram "$mmd_file" "$output_file" 2>/dev/null; then
            ((count++))
        else
            print_error "Failed: $mmd_file"
            ((failed++))
        fi
    done < <(find "${find_args[@]}" 2>/dev/null)

    echo ""
    print_info "Batch rendering complete"
    print_success "Successful: $count"
    if [[ $failed -gt 0 ]]; then
        print_error "Failed: $failed"
    fi
}

validate_diagram() {
    local input_file="$1"

    if [[ -z "$input_file" ]]; then
        print_error "Input file required"
        echo "Usage: ./docs-to-diagram.sh validate <input.mmd>"
        exit 1
    fi

    if [[ ! -f "$input_file" ]]; then
        print_error "Input file not found: $input_file"
        exit 1
    fi

    check_mmdc

    # Create a temp file for output
    local temp_output
    temp_output=$(mktemp /tmp/mermaid-validate-XXXXXX.png)
    trap 'rm -f "$temp_output"' EXIT

    print_info "Validating: $input_file"

    if mmdc -i "$input_file" -o "$temp_output" 2>&1; then
        print_success "Valid Mermaid syntax"
        rm -f "$temp_output"
        return 0
    else
        print_error "Invalid Mermaid syntax"
        return 1
    fi
}

# Main command dispatcher
main() {
    if [[ $# -eq 0 ]]; then
        show_help
        exit 0
    fi

    local command="$1"
    shift

    case "$command" in
        render)
            render_diagram "$@"
            ;;
        prompt)
            generate_prompt "$@"
            ;;
        batch)
            batch_render "$@"
            ;;
        validate)
            validate_diagram "$@"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            echo "Run './docs-to-diagram.sh help' for usage information"
            exit 1
            ;;
    esac
}

main "$@"
