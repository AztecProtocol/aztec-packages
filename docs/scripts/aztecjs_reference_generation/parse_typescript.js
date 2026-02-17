#!/usr/bin/env node
/**
 * Script to parse TypeScript files and generate structured API documentation.
 *
 * This script uses the TypeScript Compiler API to:
 * - Parse TypeScript source files
 * - Extract classes, interfaces, types, and functions
 * - Extract JSDoc comments
 * - Generate structured JSON output
 *
 * Usage:
 *   node parse_typescript.js --source ../yarn-project/aztec.js/src --output api_docs.json
 *   node parse_typescript.js --source ../yarn-project/aztec.js/src --output api_docs.json --validate
 */

const ts = require('typescript');
const fs = require('fs');
const path = require('path');

/**
 * JSDoc Validator - validates JSDoc completeness and correctness
 */
class JSDocValidator {
  constructor(options = {}) {
    this.options = {
      warnMissingDescription: true,
      warnMissingParams: true,
      warnExtraParams: true,
      warnMissingReturns: false,
      ...options
    };
    this.warnings = [];
  }

  validate(node, jsdoc, sourceFile) {
    const warnings = [];

    // Check for missing description
    if (this.options.warnMissingDescription) {
      if (!jsdoc.description || jsdoc.description.trim() === '') {
        warnings.push({
          type: 'missing_description',
          severity: 'warning',
          file: path.basename(sourceFile.fileName),
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          message: `Missing description for ${this.getNodeName(node)}`,
          node: this.getNodeName(node)
        });
      }
    }

    // Validate parameters
    if (node.parameters && node.parameters.length > 0) {
      const actualParams = node.parameters.map(p => p.name.getText(sourceFile));
      const documentedParams = jsdoc.tags
        .filter(t => t.name === 'param')
        .map(t => t.paramName);

      // Check for missing @param tags
      if (this.options.warnMissingParams) {
        for (const paramName of actualParams) {
          if (!documentedParams.includes(paramName)) {
            warnings.push({
              type: 'missing_param_doc',
              severity: 'warning',
              file: path.basename(sourceFile.fileName),
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              message: `Parameter '${paramName}' is not documented`,
              node: this.getNodeName(node),
              param: paramName
            });
          }
        }
      }

      // Check for extra @param tags
      if (this.options.warnExtraParams) {
        for (const paramName of documentedParams) {
          if (paramName && !actualParams.includes(paramName)) {
            warnings.push({
              type: 'extra_param_doc',
              severity: 'info',
              file: path.basename(sourceFile.fileName),
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              message: `@param '${paramName}' does not match any actual parameter`,
              node: this.getNodeName(node),
              param: paramName
            });
          }
        }
      }
    }

    this.warnings.push(...warnings);
    return warnings;
  }

  getNodeName(node) {
    if (node.name) {
      return node.name.getText();
    }
    return '<unknown>';
  }

  printSummary() {
    if (this.warnings.length === 0) {
      console.log('\n✅ No documentation issues found');
      return;
    }

    console.log(`\n⚠️  Found ${this.warnings.length} documentation issue(s):\n`);

    // Group by type
    const grouped = {};
    for (const warning of this.warnings) {
      if (!grouped[warning.type]) grouped[warning.type] = [];
      grouped[warning.type].push(warning);
    }

    // Display summary by type
    for (const [type, warnings] of Object.entries(grouped)) {
      const typeLabel = type.replace(/_/g, ' ');
      console.log(`  ${typeLabel}: ${warnings.length} occurrence(s)`);
    }

    console.log('');

    // Show detailed warnings (first 20)
    const displayCount = Math.min(20, this.warnings.length);
    console.log(`Showing first ${displayCount} issue(s):`);
    for (const warning of this.warnings.slice(0, displayCount)) {
      console.log(`  [${warning.severity}] ${warning.file}:${warning.line} - ${warning.message}`);
    }

    if (this.warnings.length > displayCount) {
      console.log(`\n  ... and ${this.warnings.length - displayCount} more issue(s)`);
    }
  }

  generateReport() {
    const byType = {};
    const bySeverity = { error: [], warning: [], info: [] };

    for (const warning of this.warnings) {
      if (!byType[warning.type]) {
        byType[warning.type] = [];
      }
      byType[warning.type].push(warning);
      bySeverity[warning.severity].push(warning);
    }

    return {
      total: this.warnings.length,
      byType: byType,
      bySeverity: bySeverity,
      warnings: this.warnings
    };
  }
}

class TypeScriptParser {
  constructor(sourcePath, options = {}) {
    this.sourcePath = path.resolve(sourcePath);
    this.options = {
      excludeDirs: ['api', 'node_modules', '__tests__', 'test'],
      excludeFiles: ['.test.ts', '.test.tsx', 'index.ts'],
      validate: false, // Enable validation
      ...options
    };

    // Initialize validator if validation is enabled
    this.validator = this.options.validate ? new JSDocValidator({
      warnMissingDescription: true,
      warnMissingParams: true,
      warnExtraParams: true,
    }) : null;

    // Configure TypeScript compiler
    this.compilerOptions = {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      allowJs: false,
      checkJs: false,
      noEmit: true,
      esModuleInterop: true,
      skipLibCheck: true,
    };
  }

  /**
   * Normalize whitespace in JSDoc text:
   * - Replace newlines with spaces
   * - Collapse multiple spaces into single spaces
   * - Trim leading/trailing whitespace
   * - Remove leading dash (common JSDoc convention: @param foo - description)
   */
  normalizeWhitespace(text) {
    if (!text) return '';
    return text
      .replace(/\n/g, ' ')  // Replace newlines with spaces
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim()               // Trim edges
      .replace(/^-\s*/, ''); // Remove leading dash and any following whitespace
  }

  /**
   * Main entry point - parse the source directory and generate documentation
   */
  parse() {
    const folders = this.parseDirectory(this.sourcePath);

    return {
      metadata: {
        package: '@aztec/aztec.js',
        generated_at: new Date().toISOString(),
        source_path: this.sourcePath,
      },
      folders: folders.filter(f => f.files.length > 0), // Only include folders with files
    };
  }

  /**
   * Parse a directory and return folder documentation
   */
  parseDirectory(dirPath, parentPath = '') {
    const folders = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // Get directories first
    const dirs = entries.filter(e => e.isDirectory());

    for (const dir of dirs) {
      const dirName = dir.name;

      // Skip excluded directories
      if (this.options.excludeDirs.includes(dirName) || dirName.startsWith('.')) {
        continue;
      }

      const fullDirPath = path.join(dirPath, dirName);
      const relativePath = parentPath ? `${parentPath}/${dirName}` : dirName;

      // Parse files in this directory
      const files = this.parseFilesInDirectory(fullDirPath, relativePath);

      if (files.length > 0) {
        folders.push({
          name: dirName,
          path: relativePath,
          files: files,
        });
      }

      // Recursively parse subdirectories at any depth
      folders.push(...this.parseDirectory(fullDirPath, relativePath));
    }

    return folders;
  }

  /**
   * Parse all TypeScript files in a directory
   */
  parseFilesInDirectory(dirPath, relativeDirPath) {
    const files = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const fileName = entry.name;

      // Only process .ts files (not .d.ts, not .test.ts)
      if (!fileName.endsWith('.ts') || fileName.endsWith('.d.ts')) {
        continue;
      }

      // Skip excluded files
      if (this.options.excludeFiles.some(pattern => fileName.includes(pattern))) {
        continue;
      }

      const filePath = path.join(dirPath, fileName);
      const fileDoc = this.parseFile(filePath, relativeDirPath, fileName);

      // Only include files that have exports
      if (fileDoc && fileDoc.exports.length > 0) {
        files.push(fileDoc);
      }
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Parse a single TypeScript file
   */
  parseFile(filePath, relativeDirPath, fileName) {
    // Create a TypeScript program for type inference
    // This allows us to infer return types for getters and other methods
    let program, sourceFile;
    try {
      // Try to load tsconfig.json from the package
      const packageRoot = path.resolve(this.sourcePath, '..');
      const tsconfigPath = path.join(packageRoot, 'tsconfig.json');

      let compilerOptions = {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext,
        noEmit: true,
        skipLibCheck: true,
        skipDefaultLibCheck: true,
      };

      // If tsconfig exists, use it for better type inference
      if (fs.existsSync(tsconfigPath)) {
        const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
        if (!configFile.error) {
          const parsedConfig = ts.parseJsonConfigFileContent(
            configFile.config,
            ts.sys,
            packageRoot
          );
          compilerOptions = {
            ...parsedConfig.options,
            noEmit: true,
            skipLibCheck: true,
          };
        }
      }

      program = ts.createProgram([filePath], compilerOptions);
      this.typeChecker = program.getTypeChecker();
      // Use the source file from the program (required for type checking)
      sourceFile = program.getSourceFile(filePath);
    } catch (e) {
      // If program creation fails, fall back to basic parsing without type checking
      this.typeChecker = null;
      const sourceCode = fs.readFileSync(filePath, 'utf-8');
      sourceFile = ts.createSourceFile(
        fileName,
        sourceCode,
        ts.ScriptTarget.Latest,
        true
      );
    }

    const exports = [];
    const self = this;

    // Visit each node in the AST
    function visit(node) {
      // Handle re-exports (export { foo } from 'module')
      if (ts.isExportDeclaration(node)) {
        const reExports = self.parseReExport(node, sourceFile);
        exports.push(...reExports);
        return; // Don't recurse into re-export declarations
      }

      // Check if node is exported
      const isExported = node.modifiers?.some(
        m => m.kind === ts.SyntaxKind.ExportKeyword
      );

      if (!isExported && node.kind !== ts.SyntaxKind.SourceFile) {
        return;
      }

      // Handle different export types
      if (ts.isClassDeclaration(node) && node.name) {
        exports.push(self.parseClass(node, sourceFile));
      } else if (ts.isInterfaceDeclaration(node) && node.name) {
        exports.push(self.parseInterface(node, sourceFile));
      } else if (ts.isTypeAliasDeclaration(node) && node.name) {
        exports.push(self.parseTypeAlias(node, sourceFile));
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        exports.push(self.parseFunction(node, sourceFile));
      } else if (ts.isVariableStatement(node)) {
        // Handle exported const declarations
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            exports.push(self.parseVariable(node, declaration, sourceFile));
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    // Check if this file only re-exports (no actual exports)
    if (exports.length === 0) {
      return null;
    }

    return {
      name: fileName,
      path: `${relativeDirPath}/${fileName}`,
      exports: exports,
    };
  }

  /**
   * Parse a class declaration
   */
  parseClass(node, sourceFile) {
    const name = node.name.getText(sourceFile);
    const jsdoc = this.extractJSDoc(node, sourceFile);

    const members = [];

    // Get heritage (extends, implements)
    const extendsClause = node.heritageClauses?.find(
      c => c.token === ts.SyntaxKind.ExtendsKeyword
    );
    const implementsClause = node.heritageClauses?.find(
      c => c.token === ts.SyntaxKind.ImplementsKeyword
    );

    const extendsTypes = extendsClause?.types.map(t => t.expression.getText(sourceFile)) || [];
    const implementsTypes = implementsClause?.types.map(t => t.expression.getText(sourceFile)) || [];

    // Parse members
    for (const member of node.members) {
      if (ts.isConstructorDeclaration(member)) {
        members.push(this.parseConstructor(member, sourceFile));
      } else if (ts.isMethodDeclaration(member)) {
        members.push(this.parseMethod(member, sourceFile));
      } else if (ts.isPropertyDeclaration(member)) {
        members.push(this.parseProperty(member, sourceFile));
      } else if (ts.isGetAccessor(member)) {
        members.push(this.parseAccessor(member, sourceFile, 'getter'));
      } else if (ts.isSetAccessor(member)) {
        members.push(this.parseAccessor(member, sourceFile, 'setter'));
      }
    }

    return {
      kind: 'class',
      name: name,
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      extends: extendsTypes,
      implements: implementsTypes,
      members: members,
    };
  }

  /**
   * Parse an interface declaration
   */
  parseInterface(node, sourceFile) {
    const name = node.name.getText(sourceFile);
    const jsdoc = this.extractJSDoc(node, sourceFile);

    const members = [];

    // Get heritage (extends)
    const extendsClause = node.heritageClauses?.find(
      c => c.token === ts.SyntaxKind.ExtendsKeyword
    );
    const extendsTypes = extendsClause?.types.map(t => t.expression.getText(sourceFile)) || [];

    // Parse members
    for (const member of node.members) {
      if (ts.isMethodSignature(member)) {
        members.push(this.parseMethodSignature(member, sourceFile));
      } else if (ts.isPropertySignature(member)) {
        members.push(this.parsePropertySignature(member, sourceFile));
      } else if (ts.isCallSignatureDeclaration(member)) {
        members.push(this.parseCallSignature(member, sourceFile));
      }
    }

    return {
      kind: 'interface',
      name: name,
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      extends: extendsTypes,
      members: members,
    };
  }

  /**
   * Parse a type alias declaration
   */
  parseTypeAlias(node, sourceFile) {
    const name = node.name.getText(sourceFile);
    const jsdoc = this.extractJSDoc(node, sourceFile);

    const members = [];

    // Extract members if this is an object-like type
    // Handle object types, intersection types with objects, etc.
    if (node.type) {
      this.extractTypeMembersRecursive(node.type, members, sourceFile);
    }

    return {
      kind: 'type',
      name: name,
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      members: members.length > 0 ? members : undefined,
    };
  }

  /**
   * Recursively extract members from a type node
   */
  extractTypeMembersRecursive(typeNode, members, sourceFile) {
    if (ts.isTypeLiteralNode(typeNode)) {
      // Object type: { foo: string, bar: number }
      for (const member of typeNode.members) {
        if (ts.isPropertySignature(member)) {
          members.push(this.parsePropertySignature(member, sourceFile));
        } else if (ts.isMethodSignature(member)) {
          members.push(this.parseMethodSignature(member, sourceFile));
        } else if (ts.isCallSignatureDeclaration(member)) {
          members.push(this.parseCallSignature(member, sourceFile));
        } else if (ts.isIndexSignatureDeclaration(member)) {
          members.push(this.parseIndexSignature(member, sourceFile));
        }
      }
    } else if (ts.isMappedTypeNode(typeNode)) {
      // Mapped type: { [K in T]: U }
      members.push(this.parseMappedType(typeNode, sourceFile));
    } else if (ts.isIntersectionTypeNode(typeNode)) {
      // Intersection type: A & B & { foo: string }
      for (const type of typeNode.types) {
        this.extractTypeMembersRecursive(type, members, sourceFile);
      }
    }
    // Note: We don't extract from union types as they don't have definite members
  }

  /**
   * Parse a function declaration
   */
  parseFunction(node, sourceFile) {
    const name = node.name.getText(sourceFile);
    const jsdoc = this.extractJSDoc(node, sourceFile);
    const parameters = this.extractParameters(node, jsdoc, sourceFile);
    const returnInfo = this.extractReturnInfo(node, jsdoc, sourceFile);

    return {
      kind: 'function',
      name: name,
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      parameters: parameters,
      returnType: returnInfo.type,
      returnDescription: returnInfo.description,
    };
  }

  /**
   * Parse a variable/const declaration
   */
  parseVariable(statement, declaration, sourceFile) {
    const name = declaration.name.getText(sourceFile);
    const jsdoc = this.extractJSDoc(statement, sourceFile);
    const type = declaration.type ? declaration.type.getText(sourceFile) : 'any';

    return {
      kind: 'const',
      name: name,
      signature: `const ${name}: ${type}`,
      jsdoc: jsdoc,
      type: type,
    };
  }

  /**
   * Parse a re-export declaration (export { foo, type Bar } from 'module')
   */
  parseReExport(node, sourceFile) {
    const exports = [];

    if (!node.exportClause) {
      // export * from 'module' - skip these as we can't determine individual exports
      return exports;
    }

    if (ts.isNamedExports(node.exportClause)) {
      // export { foo, type Bar } from 'module'
      for (const element of node.exportClause.elements) {
        const name = element.name.getText(sourceFile);
        const isTypeOnly = element.isTypeOnly || node.isTypeOnly;
        const moduleSpecifier = node.moduleSpecifier ? node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '') : '';

        // Create a simple re-export entry with improved documentation
        const description = isTypeOnly
          ? `This is a type re-exported from \`${moduleSpecifier}\`. See the source module for full type definition and documentation.`
          : `This is re-exported from \`${moduleSpecifier}\`. See the source module for full documentation.`;

        exports.push({
          kind: isTypeOnly ? 'type' : 'const',
          name: name,
          signature: isTypeOnly
            ? `export type { ${name} } from '${moduleSpecifier}'`
            : `export { ${name} } from '${moduleSpecifier}'`,
          jsdoc: {
            description: description,
            tags: [{
              name: 'see',
              text: moduleSpecifier
            }]
          },
          type: isTypeOnly ? 'Type Re-export' : 'Re-export',
          reExportSource: moduleSpecifier,
        });
      }
    }

    return exports;
  }

  /**
   * Parse a constructor
   */
  parseConstructor(node, sourceFile) {
    const jsdoc = this.extractJSDoc(node, sourceFile);
    const parameters = this.extractParameters(node, jsdoc, sourceFile);

    return {
      kind: 'constructor',
      name: 'constructor',
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      parameters: parameters,
    };
  }

  /**
   * Parse a method declaration
   */
  parseMethod(node, sourceFile) {
    const name = node.name.getText(sourceFile);
    const jsdoc = this.extractJSDoc(node, sourceFile);
    const parameters = this.extractParameters(node, jsdoc, sourceFile);
    const returnInfo = this.extractReturnInfo(node, jsdoc, sourceFile);

    const isStatic = node.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) || false;
    const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) || false;
    const isPrivate = node.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) || false;

    // Skip private methods
    if (isPrivate) {
      return null;
    }

    return {
      kind: 'method',
      name: name,
      static: isStatic,
      async: isAsync,
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      parameters: parameters,
      returnType: returnInfo.type,
      returnDescription: returnInfo.description,
    };
  }

  /**
   * Parse a method signature (interface)
   */
  parseMethodSignature(node, sourceFile) {
    const name = node.name.getText(sourceFile);
    const jsdoc = this.extractJSDoc(node, sourceFile);
    const parameters = this.extractParameters(node, jsdoc, sourceFile);
    const returnInfo = this.extractReturnInfo(node, jsdoc, sourceFile);

    return {
      kind: 'method',
      name: name,
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      parameters: parameters,
      returnType: returnInfo.type,
      returnDescription: returnInfo.description,
    };
  }

  /**
   * Parse a property declaration
   */
  parseProperty(node, sourceFile) {
    const name = node.name.getText(sourceFile);
    const jsdoc = this.extractJSDoc(node, sourceFile);
    const type = node.type ? node.type.getText(sourceFile) : 'any';

    const isReadonly = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword) || false;
    const isStatic = node.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) || false;
    const isPrivate = node.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) || false;

    // Skip private properties
    if (isPrivate) {
      return null;
    }

    return {
      kind: 'property',
      name: name,
      static: isStatic,
      readonly: isReadonly,
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      type: type,
    };
  }

  /**
   * Parse a property signature (interface)
   */
  parsePropertySignature(node, sourceFile) {
    const name = node.name.getText(sourceFile);
    const jsdoc = this.extractJSDoc(node, sourceFile);
    const type = node.type ? node.type.getText(sourceFile) : 'any';
    const isOptional = node.questionToken !== undefined;

    return {
      kind: 'property',
      name: name,
      optional: isOptional,
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      type: type,
    };
  }

  /**
   * Parse a call signature
   */
  parseCallSignature(node, sourceFile) {
    const jsdoc = this.extractJSDoc(node, sourceFile);
    const parameters = this.extractParameters(node, jsdoc, sourceFile);
    const returnInfo = this.extractReturnInfo(node, jsdoc, sourceFile);

    return {
      kind: 'call-signature',
      name: '()',
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      parameters: parameters,
      returnType: returnInfo.type,
      returnDescription: returnInfo.description,
    };
  }

  /**
   * Parse an index signature
   */
  parseIndexSignature(node, sourceFile) {
    const jsdoc = this.extractJSDoc(node, sourceFile);

    // Get the parameter (the key, e.g., [key: string])
    const parameter = node.parameters[0];
    const paramName = parameter ? parameter.name.getText(sourceFile) : 'key';
    const paramType = parameter && parameter.type ? parameter.type.getText(sourceFile) : 'string';

    // Get the value type
    const valueType = node.type ? node.type.getText(sourceFile) : 'any';

    return {
      kind: 'index-signature',
      name: `[${paramName}: ${paramType}]`,
      signature: `[${paramName}: ${paramType}]: ${valueType}`,
      jsdoc: jsdoc,
      type: valueType,
      keyType: paramType,
    };
  }

  /**
   * Parse a mapped type
   */
  parseMappedType(node, sourceFile) {
    const jsdoc = this.extractJSDoc(node, sourceFile);

    // Get the type parameter (e.g., K in [K in T])
    const typeParam = node.typeParameter;
    const typeParamName = typeParam ? typeParam.name.getText(sourceFile) : 'K';

    // Get the constraint (e.g., T in [K in T])
    const constraint = typeParam && typeParam.constraint ? typeParam.constraint.getText(sourceFile) : 'any';

    // Get the value type
    const valueType = node.type ? node.type.getText(sourceFile) : 'any';

    return {
      kind: 'mapped-type',
      name: `[${typeParamName} in ${constraint}]`,
      signature: `[${typeParamName} in ${constraint}]: ${valueType}`,
      jsdoc: jsdoc,
      type: valueType,
      keyType: constraint,
    };
  }

  /**
   * Parse an accessor (getter/setter)
   */
  parseAccessor(node, sourceFile, accessorType) {
    const name = node.name.getText(sourceFile);
    const jsdoc = this.extractJSDoc(node, sourceFile);
    const parameters = accessorType === 'setter' ? this.extractParameters(node, jsdoc, sourceFile) : [];
    const returnInfo = accessorType === 'getter' ? this.extractReturnInfo(node, jsdoc, sourceFile) : { type: 'void', description: '' };

    return {
      kind: accessorType,
      name: name,
      signature: this.getNodeSignature(node, sourceFile),
      jsdoc: jsdoc,
      parameters: parameters,
      returnType: returnInfo.type,
      returnDescription: returnInfo.description,
    };
  }

  /**
   * Extract JSDoc comment from a node
   */
  extractJSDoc(node, sourceFile) {
    const jsDocTags = ts.getJSDocTags(node);
    const jsDocComments = ts.getJSDocCommentsAndTags(node);

    let description = '';
    const tags = [];

    // Extract description from JSDoc comment
    for (const comment of jsDocComments) {
      if (ts.isJSDoc(comment)) {
        // comment.comment can be a string or an array of text segments
        if (typeof comment.comment === 'string') {
          description = this.normalizeWhitespace(comment.comment);
        } else if (Array.isArray(comment.comment)) {
          // Handle array of comment segments (e.g., with @link tags)
          description = this.normalizeWhitespace(comment.comment.map(segment => {
            if (typeof segment === 'string') {
              return segment;
            } else if (segment && segment.kind === ts.SyntaxKind.JSDocLink) {
              // Handle {@link SomeType} - preserve the reference
              const linkText = segment.name ? segment.name.getText(sourceFile) : segment.text || '';
              return linkText;
            } else if (segment && typeof segment.text === 'string') {
              return segment.text;
            }
            return '';
          }).join(''));
        } else if (comment.comment) {
          // Fallback: try to get .text property or convert to string
          description = this.normalizeWhitespace(comment.comment.text || String(comment.comment));
        }
        break;
      }
    }

    // Extract tags
    for (const tag of jsDocTags) {
      const tagName = tag.tagName.getText(sourceFile);

      // Extract tag comment (can be string or array of segments)
      let tagComment = '';
      if (typeof tag.comment === 'string') {
        tagComment = this.normalizeWhitespace(tag.comment);
      } else if (Array.isArray(tag.comment)) {
        tagComment = this.normalizeWhitespace(tag.comment.map(segment => {
          if (typeof segment === 'string') {
            return segment;
          } else if (segment && segment.kind === ts.SyntaxKind.JSDocLink) {
            // Handle {@link SomeType} - preserve the reference
            const linkText = segment.name ? segment.name.getText(sourceFile) : segment.text || '';
            return linkText;
          } else if (segment && typeof segment.text === 'string') {
            return segment.text;
          }
          return '';
        }).join(''));
      } else if (tag.comment) {
        tagComment = this.normalizeWhitespace(tag.comment.text || String(tag.comment));
      }

      if (tagName === 'param' && ts.isJSDocParameterTag(tag)) {
        const paramName = tag.name ? tag.name.getText(sourceFile) : '';
        const typeExpression = tag.typeExpression?.type?.getText(sourceFile) || '';

        tags.push({
          name: 'param',
          paramName: paramName,
          type: typeExpression,
          text: tagComment,
        });
      } else if (tagName === 'returns' || tagName === 'return') {
        const typeExpression = tag.typeExpression?.type?.getText(sourceFile) || '';

        tags.push({
          name: 'returns',
          type: typeExpression,
          text: tagComment,
        });
      } else {
        tags.push({
          name: tagName,
          text: tagComment,
        });
      }
    }

    const jsdoc = {
      description: description,
      tags: tags,
    };

    // Validate JSDoc if validator is enabled
    if (this.validator) {
      this.validator.validate(node, jsdoc, sourceFile);
    }

    return jsdoc;
  }

  /**
   * Extract parameters from a function/method
   */
  extractParameters(node, jsdoc, sourceFile) {
    if (!node.parameters) {
      return [];
    }

    const parameters = [];

    for (const param of node.parameters) {
      const name = param.name.getText(sourceFile);
      const type = param.type ? param.type.getText(sourceFile) : 'any';
      const isOptional = param.questionToken !== undefined || param.initializer !== undefined;

      // Find JSDoc for this parameter - check both @param tags and inline JSDoc
      const paramTag = jsdoc.tags.find(t => t.name === 'param' && t.paramName === name);
      let description = paramTag ? paramTag.text : '';

      // If no @param tag found, check for inline JSDoc comment on the parameter itself
      if (!description) {
        const paramJSDoc = ts.getJSDocCommentsAndTags(param);
        if (paramJSDoc && paramJSDoc.length > 0) {
          for (const doc of paramJSDoc) {
            if (ts.isJSDoc(doc) && doc.comment) {
              if (typeof doc.comment === 'string') {
                description = this.normalizeWhitespace(doc.comment);
              } else if (Array.isArray(doc.comment)) {
                description = this.normalizeWhitespace(doc.comment.map(segment => {
                  if (typeof segment === 'string') {
                    return segment;
                  } else if (segment && segment.kind === ts.SyntaxKind.JSDocLink) {
                    return segment.name ? segment.name.getText(sourceFile) : segment.text || '';
                  } else if (segment && typeof segment.text === 'string') {
                    return segment.text;
                  }
                  return '';
                }).join(''));
              }
              break;
            }
          }
        }
      }

      parameters.push({
        name: name,
        type: type,
        optional: isOptional,
        description: description,
      });
    }

    return parameters;
  }

  /**
   * Extract return type and description
   */
  extractReturnInfo(node, jsdoc, sourceFile) {
    let type = node.type ? node.type.getText(sourceFile) : null;

    // For nodes without explicit type (like getters), try to infer
    if (!type && this.typeChecker) {
      try {
        const signature = this.typeChecker.getSignatureFromDeclaration(node);
        if (signature) {
          const returnType = this.typeChecker.getReturnTypeOfSignature(signature);
          type = this.typeChecker.typeToString(returnType);
        }
      } catch (e) {
        // Type inference failed, will use fallback
      }
    }

    // Try JSDoc @returns tag as fallback
    if (!type) {
      const returnTag = jsdoc.tags.find(t => t.name === 'returns' || t.name === 'return');
      if (returnTag && returnTag.type) {
        type = returnTag.type;
      }
    }

    // Default to void if still no type found
    if (!type) {
      type = 'void';
    }

    // Find JSDoc return tag for description
    const returnTag = jsdoc.tags.find(t => t.name === 'returns' || t.name === 'return');
    const description = returnTag ? returnTag.text : '';

    return {
      type: type,
      description: description,
    };
  }

  /**
   * Format a normalized signature with consistent parameter formatting
   * - 0 parameters: name()
   * - 1 parameter: name(param: Type)
   * - 2+ parameters: one per line
   */
  formatNormalizedSignature(node, sourceFile) {
    const printer = ts.createPrinter({ removeComments: true });

    // Build the signature prefix (modifiers, async, name, type parameters)
    let prefix = '';

    // Add modifiers (public, private, protected, static, abstract, etc.)
    if (node.modifiers) {
      const modifierTexts = node.modifiers
        .filter(mod => mod.kind !== ts.SyntaxKind.AsyncKeyword) // Handle async separately
        .map(mod => mod.getText(sourceFile));
      if (modifierTexts.length > 0) {
        prefix += modifierTexts.join(' ') + ' ';
      }
    }

    // Add async keyword if present
    const isAsync = node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AsyncKeyword);
    if (isAsync) {
      prefix += 'async ';
    }

    // Add function/method name (constructors don't have a name property that we print)
    if (ts.isConstructorDeclaration(node)) {
      prefix += 'constructor';
    } else if (node.name) {
      prefix += node.name.getText(sourceFile);
    }

    // Add type parameters if present (e.g., <T, U>)
    if (node.typeParameters && node.typeParameters.length > 0) {
      prefix += '<';
      prefix += node.typeParameters.map(tp => printer.printNode(ts.EmitHint.Unspecified, tp, sourceFile)).join(', ');
      prefix += '>';
    }

    // Format parameters
    const parameters = node.parameters || [];
    const paramCount = parameters.length;

    let signature = '';

    if (paramCount === 0) {
      // No parameters: functionName()
      signature = prefix + '()';
    } else if (paramCount === 1) {
      // Single parameter: keep on one line
      const param = printer.printNode(ts.EmitHint.Unspecified, parameters[0], sourceFile);
      signature = prefix + '(' + param + ')';
    } else {
      // Multiple parameters: one per line with indentation
      signature = prefix + '(\n';
      parameters.forEach((param, index) => {
        const paramText = printer.printNode(ts.EmitHint.Unspecified, param, sourceFile);
        signature += '  ' + paramText;  // 2-space indent
        if (index < parameters.length - 1) {
          signature += ',';
        }
        signature += '\n';
      });
      signature += ')';
    }

    // Add return type if present (methods/functions, not constructors)
    if (!ts.isConstructorDeclaration(node) && node.type) {
      const returnType = printer.printNode(ts.EmitHint.Unspecified, node.type, sourceFile);
      // For multi-line return types, add indentation
      if (returnType.includes('\n') || returnType.includes('{')) {
        // Indent each line of the return type
        const indentedReturnType = this.indentReturnType(returnType);
        signature += ': ' + indentedReturnType;
      } else {
        signature += ': ' + returnType;
      }
    }

    return signature;
  }

  /**
   * Indent a multi-line return type for better readability
   */
  indentReturnType(returnType) {
    const lines = returnType.split('\n');
    if (lines.length === 1) {
      return returnType;
    }

    // First line stays as-is (it's on the same line as the colon)
    // Subsequent lines get 2-space indent
    return lines.map((line, index) => {
      if (index === 0) return line;
      // If the line is just closing brackets/braces, don't add extra indent
      if (line.trim() === '}' || line.trim() === ')' || line.trim() === '>') {
        return line;
      }
      return '  ' + line;
    }).join('\n');
  }

  /**
   * Get the full signature of a node as a string
   */
  getNodeSignature(node, sourceFile) {
    // For classes and interfaces, just get the declaration line
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      const fullText = node.getText(sourceFile);
      const lines = fullText.split('\n');
      // Get first line (the declaration)
      const declarationLine = lines[0].trim();
      return declarationLine.replace(/\s+{?\s*$/, '');
    }

    // For methods, constructors, functions: normalize signature formatting
    // Always format with one parameter per line for readability
    if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isConstructorDeclaration(node)) {
      return this.formatNormalizedSignature(node, sourceFile);
    }

    // For method signatures (interface methods), normalize formatting
    if (ts.isMethodSignature(node)) {
      return this.formatNormalizedSignature(node, sourceFile);
    }

    // For type aliases, return the complete definition (can be multi-line)
    if (ts.isTypeAliasDeclaration(node)) {
      const fullText = node.getText(sourceFile);
      // Remove inline JSDoc comments that may appear in the type definition
      let signature = fullText.replace(/\/\*\*[\s\S]*?\*\//g, '');
      // Clean up extra whitespace
      signature = signature.replace(/\n\s*\n/g, '\n').replace(/  +/g, ' ');
      return signature.trim();
    }

    // For everything else, just return the trimmed text
    const fullText = node.getText(sourceFile);
    return fullText.split('\n')[0].trim();
  }
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);

  let sourcePath = null;
  let outputPath = null;
  let format = 'json'; // Only JSON format supported
  let validate = false;
  let validationReportPath = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && i + 1 < args.length) {
      sourcePath = args[++i];
    } else if (args[i] === '--output' && i + 1 < args.length) {
      outputPath = args[++i];
    } else if (args[i] === '--format' && i + 1 < args.length) {
      format = args[++i];
      if (format !== 'json') {
        console.error(`Error: Only JSON format is supported. Got: ${format}`);
        process.exit(1);
      }
    } else if (args[i] === '--validate') {
      validate = true;
    } else if (args[i] === '--validation-report' && i + 1 < args.length) {
      validate = true; // Enable validation if report is requested
      validationReportPath = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: node parse_typescript.js --source <path> --output <path> [options]

Options:
  --source <path>              Source directory to parse (e.g., ../yarn-project/aztec.js/src)
  --output <path>              Output file path (JSON format)
  --format <format>            Output format: json (default: json)
  --validate                   Enable JSDoc validation and show warnings
  --validation-report <path>   Save validation report to file (implies --validate)
  --help, -h                   Show this help message

Examples:
  node parse_typescript.js --source ../yarn-project/aztec.js/src --output api_docs.json

  node parse_typescript.js --source ../yarn-project/aztec.js/src --output api_docs.json --validate

  node parse_typescript.js --source ../yarn-project/aztec.js/src --output api_docs.json \\
    --validation-report validation_report.json
      `);
      process.exit(0);
    }
  }

  if (!sourcePath || !outputPath) {
    console.error('Error: --source and --output are required');
    process.exit(1);
  }

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source path does not exist: ${sourcePath}`);
    process.exit(1);
  }

  console.log('Parsing TypeScript files...');
  const parser = new TypeScriptParser(sourcePath, { validate });
  const docs = parser.parse();

  console.log(`Found ${docs.folders.length} folders with documentation`);

  // Count total exports
  let totalExports = 0;
  for (const folder of docs.folders) {
    for (const file of folder.files) {
      totalExports += file.exports.length;
    }
  }
  console.log(`Extracted ${totalExports} exports`);

  // Write output as JSON
  const output = JSON.stringify(docs, null, 2);
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`Documentation written to: ${outputPath}`);

  // Print validation summary if validation was enabled
  if (validate && parser.validator) {
    parser.validator.printSummary();

    // Save validation report if requested
    if (validationReportPath) {
      const report = parser.validator.generateReport();
      fs.writeFileSync(validationReportPath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`Validation report written to: ${validationReportPath}`);
    }
  }
}

// Run if called directly
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = { TypeScriptParser };
