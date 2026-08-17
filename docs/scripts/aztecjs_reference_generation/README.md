# Aztec.js API Reference Generation

This directory contains scripts for automatically generating comprehensive API reference documentation from the Aztec.js TypeScript source code.

## Overview

Two approaches are available for generating API documentation:

### 1. Custom Approach (Python/JavaScript)

A **two-phase pipeline** with complete control over output:

1. **Parse** (Node.js) - Extract structure and JSDoc from TypeScript source
2. **Transform** (Python) - Convert structured data to formatted Markdown

## Quick Start

### Custom Approach (Default)

```bash
# Generate to current docs (most common)
./scripts/aztecjs_reference_generation/update_docs.sh current

# Generate to all versions
./scripts/aztecjs_reference_generation/update_docs.sh all

# Generate to specific version
./scripts/aztecjs_reference_generation/update_docs.sh v2.0.2

# Fail if the committed current-version page is out of date
./scripts/aztecjs_reference_generation/update_docs.sh --check
```

`--check` regenerates into a temp file and diffs it against the committed page,
ignoring the embedded generation timestamp. `docs/bootstrap.sh` runs it so a change
to `yarn-project/aztec.js/src` that alters the reference cannot land without the
regenerated page.

### Convenience Script (Testing - Custom Approach)

```bash
# Generate without deploying (outputs to current directory)
cd scripts/aztecjs_reference_generation
./generate_docs.sh

# Generate with JSDoc validation
./generate_docs.sh . --validate
```

## Files

### Custom Approach Scripts

- **`parse_typescript.js`** - TypeScript parser using TS Compiler API (~1200 LOC)

- **`transform_to_markdown.py`** - Markdown transformer (~700 LOC)

- **`generate_docs.sh`** - Convenience wrapper for testing

- **`update_docs.sh`** - Deployment script for production

- **`verify_docs.py`** - Verification tool

## Documentation Structure

The generated documentation follows this hierarchy:

```markdown
## Account                        # H2: Folder/Module
---
### File: `account/account.ts`   # H3: File
#### AccountContract              # H4: Export (Class/Interface/Type)
**Type:** Class
##### constructor                 # H5: Member (Method/Property)
##### Methods                     # H5: Subsection
###### deploy                     # H6: Specific method
```

## Configuration

### Customization

To modify exclusions or add options, edit the `options` object in `parse_typescript.js:165-170`:

```javascript
this.options = {
  excludeDirs: ['api', 'node_modules', '__tests__', 'test'],
  excludeFiles: ['.test.ts', '.test.tsx', 'index.ts'],
  validate: false,
  ...options
};
```

## JSDoc Validation

Enable validation to check JSDoc completeness:

```bash
./generate_docs.sh . --validate
```

**Validation checks:**
- Missing descriptions on classes, interfaces, types, functions
- Missing `@param` tags for function parameters
- Extra `@param` tags not matching actual parameters
- Missing `@returns` tags on functions with return values

## Testing

### Verify Generated Output

```bash
# Generate and verify
./generate_docs.sh
python3 verify_docs.py aztec_api_reference.md
```

### Script Options

#### parse_typescript.js

```bash
node parse_typescript.js --help
```

Options:
- `--source <path>` - Source directory to parse
- `--output <path>` - Output file path
- `--format <json|yaml>` - Output format
- `--validate` - Enable JSDoc validation
- `--validation-report <path>` - Save validation report

#### transform_to_markdown.py

```bash
python3 transform_to_markdown.py --help
```

Options:
- `--input <path>` - Input JSON file
- `--output <path>` - Output markdown file
- `--title <string>` - Documentation title

#### verify_docs.py

```bash
python3 verify_docs.py <markdown_file>
```

Returns exit code 0 if no errors, 1 if errors found.

### Generated Files

Both approaches generate to:
- `docs/docs-developers/docs/aztec-js/aztec_js_reference.md` (Custom)

## Troubleshooting

### Custom Approach

**Issue: TypeScript compilation errors**
```bash
# The parser uses TS Compiler API which may break with TS updates
# Check parse_typescript.js and update to match new TS API
```

**Issue: Missing exports**
```bash
# Check excludeDirs and excludeFiles in parse_typescript.js
# Verify files are not in test directories
```
