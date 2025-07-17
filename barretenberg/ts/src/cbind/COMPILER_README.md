# CBIND Compiler Architecture

## Overview

The CBIND compiler generates TypeScript bindings from msgpack schemas. It uses a clean, composition-based design with all functionality contained in a single file for simplicity.

## Architecture

### Core Components

1. **schema_compiler.ts** - Complete compiler implementation
   - `SchemaCompiler` class - Processes schemas and generates TypeScript code
   - Factory methods for creating configured compilers
   - All utilities and helper functions included
   - Inline strategy objects for import and method generation

2. **generate.ts** - Generation script
   - Fetches schema from bb binary
   - Uses factory methods to create compilers
   - Generates all output files

### Factory Methods

```typescript
createSharedTypesCompiler()  // For api_types.gen.ts
createSyncApiCompiler()      // For cbind.sync.gen.ts  
createAsyncApiCompiler()     // For cbind.async.gen.ts
createNativeApiCompiler()    // For native.gen.ts
```

### Design Principles

- **Composition over Inheritance**: Uses strategy pattern with inline objects
- **Single File Simplicity**: All compiler logic in one cohesive file
- **No External Dependencies**: Self-contained implementation
- **Type Safety**: Full TypeScript types throughout
- **Extensibility**: Easy to add new compilers via factory methods

## Usage

```bash
yarn generate  # Generates all TypeScript bindings
```

## Generated Files

1. **api_types.gen.ts** - Shared TypeScript interfaces and conversion functions
2. **cbind.sync.gen.ts** - Synchronous API using BarretenbergWasmMain
3. **cbind.async.gen.ts** - Asynchronous API using BarretenbergWasmMainWorker  
4. **native.gen.ts** - Native API for bb binary communication

## Adding New Output Types

To add a new output type:

1. Create a new factory method in schema_compiler.ts
2. Define inline strategies for imports and method generation
3. Add the new generator config to generate.ts

Example:
```typescript
export function createCustomCompiler(): SchemaCompiler {
  return new SchemaCompiler(
    {
      getImports: () => ['/* custom imports */'],
      getTypePrefix: () => 'custom.',
    },
    {
      generateMethod: (metadata) => '/* custom method */',
      getWrapperClass: (methods) => '/* custom class */',
    }
  );
}
```