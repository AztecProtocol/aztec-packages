/* eslint-disable import-x/no-named-as-default-member */
import { keccak256String } from '@aztec/foundation/crypto/keccak';

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import ts from 'typescript';
import { fileURLToPath } from 'url';

import { ORACLE_INTERFACE_HASH } from '../oracle_version.js';

/**
 * Verifies that the Oracle interface matches the expected interface hash.
 *
 * The Oracle interface needs to be versioned to ensure compatibility between Aztec.nr and PXE. This function computes
 * a hash of the Oracle interface and compares it against a known hash. If they don't match, it means the interface has
 * changed and the oracle version needs to be bumped:
 *   - If the change is backward-breaking (e.g. removing/renaming an oracle), bump ORACLE_VERSION_MAJOR.
 *   - If the change is an oracle addition (non-breaking), bump ORACLE_VERSION_MINOR.
 */
function assertOracleInterfaceMatches(): void {
  const excludedProps = [
    'handler',
    'constructor',
    'toACIRCallback',
    'handlerAsMisc',
    'handlerAsUtility',
    'handlerAsPrivate',
  ];

  // Get the path to Oracle.ts source file
  // The script runs from dest/bin/ after compilation, so we need to go up to the package root
  // then into src/ to find the source file
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // Go up from dest/bin/ or src/bin/ to the package root (pxe/), then into src/
  const packageRoot = dirname(dirname(currentDir)); // Go up from bin/ to pxe/
  const oracleSourcePath = join(packageRoot, 'src/contract_function_simulator/oracle/oracle.ts');

  const oracleInterfaceSignature = getOracleInterfaceSignature(oracleSourcePath, ['Oracle'], excludedProps);

  // We use keccak256 here just because we already have it in the dependencies.
  const oracleInterfaceHash = keccak256String(oracleInterfaceSignature);
  if (oracleInterfaceHash !== ORACLE_INTERFACE_HASH) {
    throw new Error(
      `The Oracle interface has changed. Update ORACLE_INTERFACE_HASH to ${oracleInterfaceHash} in pxe/src/oracle_version.ts and bump the oracle version (ORACLE_VERSION_MAJOR for breaking changes, ORACLE_VERSION_MINOR for oracle additions).`,
    );
  }
}

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
  // Read and parse the TypeScript source file
  const sourceCode = readFileSync(sourcePath, 'utf-8');
  const sourceFile = ts.createSourceFile(sourcePath, sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  // Extract method signatures from the target classes/interfaces
  const methodSignatures: string[] = [];

  function visit(node: ts.Node) {
    // Look for class or interface declarations matching the target names
    const isTarget =
      (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) && targets.includes(node.name?.text ?? '');

    if (isTarget) {
      // Visit all members of the class/interface
      node.members.forEach(member => {
        if (
          (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          const methodName = member.name.text;

          // Skip excluded methods
          if (excludedMembers.includes(methodName)) {
            return;
          }

          // Extract parameter signatures
          const paramSignatures: string[] = [];
          member.parameters.forEach(param => {
            const paramName = extractParameterName(param, sourceFile);
            const paramType = extractTypeString(param.type, sourceFile);
            paramSignatures.push(`${paramName}: ${paramType}`);
          });

          // Extract return type
          const returnType = extractTypeString(member.type, sourceFile);

          // Build full signature: methodName(param1: Type1, param2: Type2): ReturnType
          const signature = `${methodName}(${paramSignatures.join(', ')}): ${returnType}`;
          methodSignatures.push(signature);
        }
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Sort signatures alphabetically for consistent hashing
  methodSignatures.sort();

  // Create a hashable representation by concatenating all signatures
  return methodSignatures.join('');
}

/**
 * Extracts the parameter name from a parameter node, handling destructured parameters.
 */
function extractParameterName(param: ts.ParameterDeclaration, sourceFile: ts.SourceFile): string {
  const name = param.name;

  if (ts.isIdentifier(name)) {
    return name.text;
  }

  if (ts.isArrayBindingPattern(name)) {
    // Handle destructured parameters like [blockNumber]: ACVMField[]
    // Extract the first element name
    if (name.elements.length > 0) {
      const element = name.elements[0];
      if (ts.isBindingElement(element)) {
        const elementName = element.name;
        if (ts.isIdentifier(elementName)) {
          return elementName.text;
        }
        // Nested destructuring - use text representation
        if (ts.isArrayBindingPattern(elementName) || ts.isObjectBindingPattern(elementName)) {
          return elementName.getText(sourceFile);
        }
      }
    }
    // Fallback: return the text representation
    return name.getText(sourceFile);
  }

  if (ts.isObjectBindingPattern(name)) {
    // Handle object destructuring
    return name.getText(sourceFile);
  }

  // Fallback for any other case - this should never happen but TypeScript needs it
  return (name as ts.Node).getText(sourceFile);
}

/**
 * Extracts the type string from a type node, normalizing whitespace.
 */
function extractTypeString(typeNode: ts.TypeNode | undefined, sourceFile: ts.SourceFile): string {
  if (!typeNode) {
    return 'void';
  }

  // Get the type text and normalize whitespace
  let typeText = typeNode.getText(sourceFile);
  // Normalize whitespace: remove extra spaces, newlines, and tabs
  typeText = typeText.replace(/\s+/g, ' ').trim();
  return typeText;
}

assertOracleInterfaceMatches();
