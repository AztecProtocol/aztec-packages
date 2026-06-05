/* eslint-disable import-x/no-named-as-default-member */
import { readFileSync } from 'fs';
import ts from 'typescript';

/**
 * Extracts method signatures from TypeScript classes or interfaces and returns a deterministic string representation.
 *
 * This is used to detect when an oracle interface changes so that the oracle version can be bumped. It works with both
 * class declarations (e.g. PXE's `Oracle` class) and interface declarations (e.g. TXE's `IAvmExecutionOracle`).
 *
 * @param sourcePath - Absolute path to the TypeScript source file to parse.
 * @param targets - Names of classes or interfaces to extract methods from.
 * @param excludedMembers - Method names to skip (e.g. non-oracle helpers like `constructor`).
 */
export function getOracleInterfaceSignature(sourcePath: string, targets: string[], excludedMembers: string[]): string {
  const sourceCode = readFileSync(sourcePath, 'utf-8');
  const sourceFile = ts.createSourceFile(sourcePath, sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const methodSignatures: string[] = [];

  function visit(node: ts.Node) {
    const isTarget =
      (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) && targets.includes(node.name?.text ?? '');

    if (isTarget) {
      node.members.forEach(member => {
        if (
          (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          const methodName = member.name.text;

          if (excludedMembers.includes(methodName)) {
            return;
          }

          const paramSignatures: string[] = [];
          member.parameters.forEach(param => {
            const paramName = extractParameterName(param, sourceFile);
            const paramType = extractTypeString(param.type, sourceFile);
            paramSignatures.push(`${paramName}: ${paramType}`);
          });

          const returnType = extractTypeString(member.type, sourceFile);

          const signature = `${methodName}(${paramSignatures.join(', ')}): ${returnType}`;
          methodSignatures.push(signature);
        }
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  methodSignatures.sort();

  return methodSignatures.join('');
}

/**
 * Extracts a deterministic signature string from an oracle registry object literal (e.g. PXE's `ORACLE_REGISTRY`).
 *
 * Reads the registry declaration where each oracle's wire ABI lives: the ordered parameter names with their
 * `TypeMapping` expressions and the return type. The resulting hash is sensitive to parameter, type, and return
 * changes, not just oracle additions and removals.
 *
 * Type expressions are captured as their source text (e.g. `OPTION(AZTEC_ADDRESS)`, `BOUNDED_VEC(NOTE)`), so the
 * signature tracks the composition of types. However, if the internal serialization logic of a `TypeMapping` constant
 * (e.g. `FIELD`) changes without the constant being renamed, the hash will not change.
 *
 * @example
 * // Given a registry like:
 * //   export const ORACLE_REGISTRY = {
 * //     aztec_utl_foo: makeEntry({ params: [{ name: 'a', type: U32 }], returnType: BOOL }),
 * //     aztec_prv_bar: makeEntry(),
 * //   } satisfies Record<string, OracleRegistryEntry>;
 * //
 * // Returns (sorted, newline-joined):
 * //   "aztec_prv_bar(): void\naztec_utl_foo(a: U32): BOOL"
 *
 * @param sourcePath - Absolute path to the TypeScript source file declaring the registry.
 * @param registryName - Name of the registry constant to read (e.g. `ORACLE_REGISTRY`).
 */
export function getOracleRegistrySignature(sourcePath: string, registryName: string): string {
  const sourceCode = readFileSync(sourcePath, 'utf-8');
  const sourceFile = ts.createSourceFile(sourcePath, sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const registry = findObjectLiteral(sourceFile, registryName);
  if (!registry) {
    throw new Error(`Could not find oracle registry '${registryName}' in ${sourcePath}.`);
  }

  const oracleSignatures = registry.properties.map(property => {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(
        `Unexpected member in oracle registry '${registryName}': ${property.getText(sourceFile)}. Spread elements ` +
          `are not supported.`,
      );
    }

    const oracleName = getPropertyName(property.name, sourceFile);
    const { params, returnType } = extractRegistryEntry(property.initializer, sourceFile);
    const paramSignatures = params.map(param => `${param.name}: ${param.type}`);
    return `${oracleName}(${paramSignatures.join(', ')}): ${returnType}`;
  });

  oracleSignatures.sort();

  return oracleSignatures.join('\n');
}

/**
 * Reads an integer-valued global constant from a Noir or TypeScript source file.
 *
 * Matches both the Noir form (`pub global NAME: Field = N;`) and the TypeScript form (`export const NAME = N;`). This
 * lets us compare a version constant that is hand-duplicated across the TS and Noir layers (which can't import each
 * other) without depending on either compiler. Only the assignment form `NAME = N` matches, so later usages of the
 * constant are ignored regardless of their order in the file.
 *
 * @param sourcePath - Absolute path to the source file to read.
 * @param name - Name of the global constant whose integer value should be extracted.
 * @returns The integer value assigned to the constant.
 * @throws If the constant's declaration is not found in the file.
 */
export function readNumericGlobal(sourcePath: string, name: string): number {
  const sourceCode = readFileSync(sourcePath, 'utf-8');
  const match = sourceCode.match(new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(\\d+)`));
  if (!match) {
    throw new Error(`Could not find numeric global '${name}' in ${sourcePath}.`);
  }
  return Number(match[1]);
}

function extractParameterName(param: ts.ParameterDeclaration, sourceFile: ts.SourceFile): string {
  const name = param.name;

  if (ts.isIdentifier(name)) {
    return name.text;
  }

  if (ts.isArrayBindingPattern(name)) {
    if (name.elements.length > 0) {
      const element = name.elements[0];
      if (ts.isBindingElement(element)) {
        const elementName = element.name;
        if (ts.isIdentifier(elementName)) {
          return elementName.text;
        }
        if (ts.isArrayBindingPattern(elementName) || ts.isObjectBindingPattern(elementName)) {
          return elementName.getText(sourceFile);
        }
      }
    }
    return name.getText(sourceFile);
  }

  if (ts.isObjectBindingPattern(name)) {
    return name.getText(sourceFile);
  }

  return (name as ts.Node).getText(sourceFile);
}

/** Returns the source text of a type annotation, or `'void'` if absent. */
function extractTypeString(typeNode: ts.TypeNode | undefined, sourceFile: ts.SourceFile): string {
  if (!typeNode) {
    return 'void';
  }

  return typeNode.getText(sourceFile).replace(/\s+/g, ' ').trim();
}

/**
 * Finds a top-level object-literal-valued constant by name, unwrapping `satisfies`/`as`/parenthesized wrappers.
 *
 * @example
 * // `const REGISTRY = { ... } satisfies Record<string, Entry>` => the `{ ... }` ObjectLiteralExpression
 */
function findObjectLiteral(sourceFile: ts.SourceFile, name: string): ts.ObjectLiteralExpression | undefined {
  let result: ts.ObjectLiteralExpression | undefined;

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      result = unwrapObjectLiteral(node.initializer);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

/** Peels `satisfies`, `as`, and parenthesized wrappers off an expression to reach the underlying object literal. */
function unwrapObjectLiteral(node: ts.Expression): ts.ObjectLiteralExpression | undefined {
  let current = node;
  while (ts.isSatisfiesExpression(current) || ts.isAsExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return ts.isObjectLiteralExpression(current) ? current : undefined;
}

/**
 * Extracts the ordered `params` (names + type expressions) and `returnType` from a `makeEntry({ ... })` call.
 *
 * @example
 * // makeEntry({ params: [{ name: 'a', type: OPTION(FIELD) }], returnType: BOOL })
 * // => { params: [{ name: 'a', type: 'OPTION(FIELD)' }], returnType: 'BOOL' }
 * //
 * // makeEntry()
 * // => { params: [], returnType: 'void' }
 */
function extractRegistryEntry(
  initializer: ts.Expression,
  sourceFile: ts.SourceFile,
): { params: { name: string; type: string }[]; returnType: string } {
  if (!ts.isCallExpression(initializer)) {
    throw new Error(`Expected a makeEntry(...) call but got: ${initializer.getText(sourceFile)}`);
  }

  const [arg] = initializer.arguments;
  if (arg === undefined) {
    return { params: [], returnType: 'void' };
  }
  if (!ts.isObjectLiteralExpression(arg)) {
    throw new Error(`Expected a makeEntry object argument but got: ${arg.getText(sourceFile)}`);
  }

  let params: { name: string; type: string }[] = [];
  let returnType = 'void';

  arg.properties.forEach(property => {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(`Unexpected makeEntry property: ${property.getText(sourceFile)}`);
    }
    const key = getPropertyName(property.name, sourceFile);
    if (key === 'params') {
      params = extractRegistryParams(property.initializer, sourceFile);
    } else if (key === 'returnType') {
      returnType = normalizeExpressionText(property.initializer, sourceFile);
    } else {
      throw new Error(`Unexpected makeEntry property '${key}'.`);
    }
  });

  return { params, returnType };
}

/**
 * Extracts `{ name, type }` pairs from the `params` array literal inside a `makeEntry` call.
 */
function extractRegistryParams(
  initializer: ts.Expression,
  sourceFile: ts.SourceFile,
): { name: string; type: string }[] {
  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`Expected a params array but got: ${initializer.getText(sourceFile)}`);
  }

  return initializer.elements.map(element => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new Error(`Expected a param object but got: ${element.getText(sourceFile)}`);
    }

    let name: string | undefined;
    let type: string | undefined;
    element.properties.forEach(property => {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error(`Unexpected param property: ${property.getText(sourceFile)}`);
      }
      const key = getPropertyName(property.name, sourceFile);
      if (key === 'name') {
        if (!ts.isStringLiteralLike(property.initializer)) {
          throw new Error(`Expected a string literal param name but got: ${property.initializer.getText(sourceFile)}`);
        }
        name = property.initializer.text;
      } else if (key === 'type') {
        type = normalizeExpressionText(property.initializer, sourceFile);
      } else {
        throw new Error(`Unexpected param property '${key}'.`);
      }
    });

    if (name === undefined || type === undefined) {
      throw new Error(`Param missing 'name' or 'type': ${element.getText(sourceFile)}`);
    }
    return { name, type };
  });
}

/** Returns the text of an identifier or string-literal property name, throwing on computed or numeric names. */
function getPropertyName(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
    return name.text;
  }
  throw new Error(`Unsupported property name: ${name.getText(sourceFile)}`);
}

/**
 * Returns the source text of an expression with all whitespace stripped for format-insensitive comparison.
 *
 * @example
 * // `OPTION(\n  AZTEC_ADDRESS\n)` => `"OPTION(AZTEC_ADDRESS)"`
 */
function normalizeExpressionText(node: ts.Expression, sourceFile: ts.SourceFile): string {
  // Type expressions are TypeMapping references and calls (identifiers, parentheses, commas, numbers) with no
  // meaningful whitespace, so we strip it entirely to keep the signature stable across reformatting.
  return node.getText(sourceFile).replace(/\s+/g, '');
}
