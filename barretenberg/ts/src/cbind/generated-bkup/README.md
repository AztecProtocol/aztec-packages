# Generated Files

This directory contains auto-generated TypeScript bindings from msgpack schemas.

**⚠️ This directory is gitignored - do not commit these files!**

## Files

- `api_types.ts` - Shared TypeScript interfaces and conversion functions
- `sync.ts` - Synchronous API wrapper  
- `async.ts` - Asynchronous API wrapper
- `native.ts` - Native bb binary API wrapper

## Regenerating

Run `yarn generate` from the barretenberg/ts directory to regenerate these files.

The generation is controlled by `../generate.ts` which uses the schema compiler in `../schema_compiler.ts`.