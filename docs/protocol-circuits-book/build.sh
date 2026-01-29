#!/bin/bash

# Build script for Aztec Protocol Circuits Book
# Generates a single PDF from all chapter markdown files
#
# Requirements:
#   - pandoc (https://pandoc.org/)
#   - LaTeX distribution (texlive-full recommended for PDF output)
#
# Installation (Ubuntu/Debian):
#   sudo apt-get install pandoc texlive-full texlive-xetex
#
# Installation (macOS):
#   brew install pandoc
#   brew install --cask mactex
#
# Usage:
#   ./build.sh              # Build PDF
#   ./build.sh html         # Build HTML
#   ./build.sh epub         # Build EPUB
#   ./build.sh all          # Build all formats

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAPTERS_DIR="$SCRIPT_DIR/chapters"
OUTPUT_DIR="$SCRIPT_DIR/output"
BOOK_NAME="aztec-protocol-circuits"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Chapter files in order
CHAPTERS=(
    "00-frontmatter.md"
    "01-introduction.md"
    "02-architecture.md"
    "03-transaction-lifecycle.md"
    "04-private-kernel.md"
    "04a-app-kernel-interface.md"
    "05-composer-validator.md"
    "06-accumulated-data.md"
    "07-public-execution.md"
    "08-hiding-kernels.md"
    "09-tx-rollup.md"
    "10-block-rollup.md"
    "11-checkpoint-rollup.md"
    "12-epoch-rollup.md"
    "13-state-trees.md"
    "14-blobs.md"
    "15-topology.md"
    "16-constants.md"
    "17-appendix.md"
    "18-auditor-guide.md"
)

# Build chapter paths
CHAPTER_PATHS=()
for chapter in "${CHAPTERS[@]}"; do
    CHAPTER_PATHS+=("$CHAPTERS_DIR/$chapter")
done

check_pandoc() {
    if ! command -v pandoc &> /dev/null; then
        echo "Error: pandoc is not installed."
        echo "Please install pandoc: https://pandoc.org/installing.html"
        exit 1
    fi
}

build_pdf() {
    check_pandoc
    echo "Building PDF..."
    
    # Check for pdflatex
    if ! command -v pdflatex &> /dev/null; then
        echo "Warning: pdflatex not found. Trying xelatex..."
        PDF_ENGINE="--pdf-engine=xelatex"
    else
        PDF_ENGINE="--pdf-engine=pdflatex"
    fi
    
    pandoc "${CHAPTER_PATHS[@]}" \
        -o "$OUTPUT_DIR/$BOOK_NAME.pdf" \
        $PDF_ENGINE \
        --toc \
        --toc-depth=2 \
        -V geometry:margin=1in \
        -V documentclass=report \
        -V fontsize=11pt \
        -V linkcolor=blue \
        -V urlcolor=blue \
        -V toccolor=black \
        --highlight-style=tango \
        -V header-includes='\usepackage{fvextra}\DefineVerbatimEnvironment{Highlighting}{Verbatim}{breaklines,commandchars=\\\{\}}' \
        --metadata title="Aztec Protocol Circuits" \
        --metadata author="Based on aztec-packages repository" \
        --metadata date="$(date +%Y-%m-%d)"
    
    echo "PDF created: $OUTPUT_DIR/$BOOK_NAME.pdf"
}

build_html() {
    check_pandoc
    echo "Building HTML..."
    
    pandoc "${CHAPTER_PATHS[@]}" \
        -o "$OUTPUT_DIR/$BOOK_NAME.html" \
        --standalone \
        --toc \
        --toc-depth=2 \
        --highlight-style=tango \
        --metadata title="Aztec Protocol Circuits" \
        --css="https://cdn.simplecss.org/simple.min.css"
    
    echo "HTML created: $OUTPUT_DIR/$BOOK_NAME.html"
}

build_epub() {
    check_pandoc
    echo "Building EPUB..."
    
    pandoc "${CHAPTER_PATHS[@]}" \
        -o "$OUTPUT_DIR/$BOOK_NAME.epub" \
        --toc \
        --toc-depth=2 \
        --highlight-style=tango \
        --metadata title="Aztec Protocol Circuits" \
        --metadata author="Based on aztec-packages repository"
    
    echo "EPUB created: $OUTPUT_DIR/$BOOK_NAME.epub"
}

build_single_markdown() {
    echo "Building single Markdown file..."
    
    cat "${CHAPTER_PATHS[@]}" > "$OUTPUT_DIR/$BOOK_NAME.md"
    
    echo "Markdown created: $OUTPUT_DIR/$BOOK_NAME.md"
}

# Parse arguments
case "${1:-pdf}" in
    pdf)
        build_pdf
        ;;
    html)
        build_html
        ;;
    epub)
        build_epub
        ;;
    md|markdown)
        build_single_markdown
        ;;
    all)
        build_pdf
        build_html
        build_epub
        build_single_markdown
        ;;
    *)
        echo "Usage: $0 [pdf|html|epub|md|all]"
        echo ""
        echo "Options:"
        echo "  pdf       Build PDF (default)"
        echo "  html      Build standalone HTML"
        echo "  epub      Build EPUB ebook"
        echo "  md        Concatenate to single Markdown"
        echo "  all       Build all formats"
        exit 1
        ;;
esac

echo "Done!"
