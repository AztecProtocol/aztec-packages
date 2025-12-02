# Aztec-nr API Documentation Generation

This script generates API documentation for the `aztec-nr` Noir framework using `nargo doc`.

## Usage

```bash
# Generate docs for "next" version (default)
./generate_aztec_nr_docs.sh

# Generate docs for a specific version
./generate_aztec_nr_docs.sh v1.0.0
```

Or from the docs root:

```bash
./scripts/aztec_nr_docs_generation/generate_aztec_nr_docs.sh [version]
```

## Requirements

- `nargo` must be available in PATH or set via `NARGO` environment variable
- The `aztec-nr` workspace must be at `../noir-projects/aztec-nr` relative to the docs folder

## Output

The generated HTML documentation is placed in version-specific folders:

- `static/aztec-nr-api/next/` - Current development version
- `static/aztec-nr-api/v1.0.0/` - Version 1.0.0
- etc.

The docs are served at `/aztec-nr-api/<version>/index.html`.

## Versioning

When creating a new documentation version:

1. Generate the API docs for that version:
   ```bash
   ./scripts/aztec_nr_docs_generation/generate_aztec_nr_docs.sh v1.0.0
   ```

2. The MDX wrapper page (`docs/developers/docs/aztec-nr/api.mdx`) automatically detects the current Docusaurus version and links to the appropriate API docs folder.

## Generated Content

The documentation includes:

- **Crates**: address_note, compressed_string, easy_private_state, noir_aztec, uint_note, value_note
- **Modules**: All public modules including state_vars, context, authwit, messages, etc.
- **Functions**: Public functions with their signatures and documentation comments
- **Structs/Types**: Public types and their implementations

## Styling

The generated docs use their own CSS (`styles.css`) with light/dark mode support. The styling is kept separate from Docusaurus to maintain consistency with standard Noir documentation.
