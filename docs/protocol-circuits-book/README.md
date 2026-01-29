# Aztec Protocol Circuits Book

A comprehensive guide to understanding Aztec's kernel and rollup circuits.

## Contents

The book covers:

**Part I: Foundations**
1. **Introduction** - What is Aztec, ZKPs, notes, nullifiers
2. **Architecture** - L2 overview, system components
3. **Transaction Lifecycle** - End-to-end transaction flow

**Part II: Private Execution**
4. **Private Kernel Circuits** - Init, Inner, Reset, Tail variants
5. **Composer/Validator Pattern** - Architectural pattern with real code
6. **Accumulated Data Flow** - How side effects flow through kernels

**Part III: Public Execution**
7. **Public Execution** - AVM and public function processing
8. **Hiding Kernels** - Bridge between private and public/rollup

**Part IV: Rollup Circuits**
9. **Transaction Rollup** - TX Base and TX Merge circuits
10. **Block Rollup** - Block Root and Block Merge circuits
11. **Checkpoint Rollup** - Checkpoint Root, blob finalization
12. **Epoch Rollup** - Root Rollup and L1 submission

**Part V: Infrastructure**
13. **State Trees** - Merkle tree structures (with beginner explanation)
14. **Data Availability** - Blob protocol and KZG commitments (with beginner explanation)
15. **Circuit Topology** - Complete circuit relationship map
16. **Protocol Constants** - Key limits and parameters

**Part VI: Reference**
17. **Appendix** - Glossary and references
18. **Auditor's Guide** - Security-focused code review with real code examples

## Building

### Requirements

- [pandoc](https://pandoc.org/installing.html) - Document converter
- LaTeX distribution (for PDF output):
  - Ubuntu/Debian: `sudo apt-get install texlive-full texlive-xetex`
  - macOS: `brew install --cask mactex`

### Quick Start

```bash
# Make the script executable
chmod +x build.sh

# Build PDF
./build.sh pdf

# Build HTML
./build.sh html

# Build all formats
./build.sh all
```

### Output

Generated files are placed in the `output/` directory:

- `aztec-protocol-circuits.pdf` - PDF book
- `aztec-protocol-circuits.html` - Standalone HTML
- `aztec-protocol-circuits.epub` - EPUB ebook
- `aztec-protocol-circuits.md` - Combined Markdown

## Structure

```
protocol-circuits-book/
    README.md           # This file
    build.sh            # Build script
    chapters/           # Book chapters
        00-frontmatter.md
        01-introduction.md
        02-architecture.md
        ...
    output/             # Generated files (gitignored)
```

## Contributing

The book is based on the `noir-projects/noir-protocol-circuits` code and existing documentation. To update:

1. Check the source code for changes
2. Update relevant chapter files
3. Rebuild to verify formatting

## License

Same as the aztec-packages repository.
