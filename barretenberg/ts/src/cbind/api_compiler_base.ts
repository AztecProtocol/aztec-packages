import { MsgpackSchemaCompiler } from './msgpack_schema_compiler.js';

/**
 * Base compiler for API implementations that imports shared types from api_types.gen.ts
 * instead of generating its own type definitions.
 */
export abstract class ApiCompilerBase extends MsgpackSchemaCompiler {
  /**
   * Override to skip generating type declarations - these come from api_types.gen.ts
   */
  protected generateTypeDeclarations(): string[] {
    // No type declarations - they're imported from api_types.gen.ts
    return [];
  }

  /**
   * Generate imports including the shared types
   */
  protected generateImports(): string[] {
    const imports = [
      `import { Buffer } from 'buffer';`,
      `import * as apiTypes from './apiTypes.gen.js';`,
    ];

    // Re-export all the public types for convenience
    const reExports = [];
    for (const typeName of Object.keys(this.typeInfos).sort()) {
      const typeInfo = this.typeInfos[typeName];
      // Only re-export the public interfaces, not Msgpack ones
      if (!typeName.startsWith('Msgpack')) {
        reExports.push(typeName);
      }
    }

    if (reExports.length > 0) {
      imports.push(`export type { ${reExports.join(', ')} } from './apiTypes.gen.js';`);
    }

    return imports;
  }

  /**
   * Override getTypeInfo to prefix type references with apiTypes
   */
  protected getImportPrefix(): string {
    return 'apiTypes.';
  }

  /**
   * Generate the API class with proper imports
   */
  compile(): string {
    const imports = this.generateImports();
    const apiClass = this.generateApiClass();

    const outputs: string[] = [
      `/* eslint-disable */`,
      `// GENERATED FILE DO NOT EDIT, RUN yarn generate`,
      ...imports,
      '',
      ...this.generateWasmImports(),
      '',
      apiClass,
    ];

    return outputs.join('\n') + '\n';
  }

  /**
   * Generate WASM imports specific to the implementation
   */
  protected abstract generateWasmImports(): string[];

  /**
   * Generate the API class implementation
   */
  protected abstract generateApiClass(): string;
}
