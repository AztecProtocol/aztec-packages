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

function extractTypeString(typeNode: ts.TypeNode | undefined, sourceFile: ts.SourceFile): string {
  if (!typeNode) {
    return 'void';
  }

  return typeNode.getText(sourceFile).replace(/\s+/g, ' ').trim();
}
