# Barretenberg Documentation

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```bash
yarn
```

## Local Development

```bash
yarn dev
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Netlify Development (Full-Stack Testing)

For testing features that require Netlify functions (like email subscriptions), use the Netlify development environment:

```bash
yarn dev:netlify
```

**Environment Setup:**
Create a `.env` file in the project root for Netlify functions:

```bash
# Copy .env.template to .env and update with your API key
cp .env.template .env
```

Then edit `.env` with your actual Brevo API key.

## Build

```bash
yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Code Inclusion System

The documentation uses a code inclusion system that allows you to include code snippets from separate example files, ensuring that all examples are testable and up-to-date.

### How It Works

1. **Mark code sections** in your example files with special comments:
   ```javascript
   // docs:start:example-name
   export function myExample() {
     // Code here will be included in docs
   }
   // docs:end:example-name
   ```

2. **Include in documentation** using the `#include_code` directive:
   ```markdown
   #include_code example-name path/to/file.js javascript
   ```

3. **Highlighting directives** can be used within the code:
   - `// highlight-next-line:example-name` - Highlights the next line
   - `// highlight-start:example-name` and `// highlight-end:example-name` - Highlights a block
   - `// this-will-error:example-name` - Marks code that will error

### Processing Code Inclusions

To process all `#include_code` directives in the documentation:

```bash
node scripts/preprocess.js
```

This will scan all markdown files in the `docs/` directory and replace `#include_code` directives with the actual code from the referenced files.

### Example Usage

1. Create an example file (e.g., `examples/js/proving-example.js`):
   ```javascript
   import { UltraHonkBackend } from '@aztec/bb.js';

   // docs:start:basic-proving
   export async function basicProving(bytecode, witness) {
     const backend = new UltraHonkBackend(bytecode);

     try {
       // highlight-next-line:basic-proving
       const proof = await backend.generateProof(witness);
       return proof;
     } finally {
       await backend.destroy();
     }
   }
   // docs:end:basic-proving
   ```

2. Include in your markdown file:
   ```markdown
   ## Basic Proving

   Here's how to generate a proof:

   #include_code basic-proving examples/js/proving-example.js javascript
   ```

3. Run the preprocessor to update the documentation:
   ```bash
   node scripts/preprocess.js
   ```

### Benefits

- **Testable Examples**: All code examples can be in separate files that can be tested
- **Up-to-Date Documentation**: Code changes are automatically reflected in docs
- **Syntax Highlighting**: Proper syntax highlighting for included code
- **Error Prevention**: Reduces copy-paste errors in documentation
