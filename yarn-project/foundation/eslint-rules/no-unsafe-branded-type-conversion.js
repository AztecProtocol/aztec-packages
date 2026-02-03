// @ts-check
import * as ts from 'typescript';

/**
 * @fileoverview Rule to disallow unsafe conversions between branded types.
 *
 * This rule prevents:
 * 1. Passing one branded type to another branded type's factory function
 *    e.g., CheckpointNumber(blockNumber) where blockNumber is a BlockNumber
 *
 * 2. Using type assertions to convert between branded types
 *    e.g., blockNumber as CheckpointNumber or blockNumber as unknown as CheckpointNumber
 *
 * 3. (Bonus) Simple arithmetic expressions on branded types passed to different branded type factories
 *    e.g., CheckpointNumber(blockNumber + 1)
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow unsafe conversions between branded types',
      category: 'Type Safety',
      recommended: true,
    },
    messages: {
      unsafeBrandedConversion:
        'Unsafe conversion from branded type {{sourceType}} to {{targetType}}. Use an explicit conversion method like {{targetType}}.from{{sourceTypeName}}() if one exists.',
      unsafeBrandedAssertion:
        'Unsafe type assertion from {{sourceType}} to {{targetType}}. Use an explicit conversion method instead of type assertions.',
      unsafeBrandedArithmetic:
        'Arithmetic on branded type {{sourceType}} passed to {{targetType}}. The result loses the brand - use an explicit conversion method if this is intentional.',
    },
    schema: [],
  },

  create(context) {
    // Known branded type names from foundation/src/branded-types
    const BRANDED_TYPES = new Set([
      'BlockNumber',
      'CheckpointNumber',
      'EpochNumber',
      'SlotNumber',
      'IndexWithinCheckpoint',
    ]);

    // Get TypeScript type services
    let parserServices = null;
    let checker = null;

    try {
      // @ts-expect-error parserServices might not be defined in all contexts
      parserServices =
        context.parserServices || context.sourceCode?.parserServices || context.getSourceCode()?.parserServices;

      if (parserServices?.program && parserServices?.esTreeNodeToTSNodeMap) {
        checker = parserServices.program.getTypeChecker();
      }
    } catch {
      // TypeScript services not available, fall back to AST-only checking
    }

    /**
     * Extract the branded type name from a TypeScript type.
     * Looks for the _branding property in intersection types.
     * @param {ts.Type} tsType
     * @returns {string | null}
     */
    function getBrandedTypeName(tsType) {
      if (!tsType || !checker) {
        return null;
      }

      // Check if this is an intersection type (T & { _branding: Brand })
      if (tsType.isIntersection && tsType.isIntersection()) {
        for (const memberType of tsType.types) {
          // Look for the object type with _branding property
          if (memberType.getFlags() & ts.TypeFlags.Object) {
            const brandingProp = memberType.getProperty('_branding');
            if (brandingProp) {
              const brandingType = checker.getTypeOfSymbolAtLocation(
                brandingProp,
                brandingProp.valueDeclaration || brandingProp.declarations?.[0],
              );
              if (brandingType && brandingType.isStringLiteral && brandingType.isStringLiteral()) {
                return brandingType.value;
              }
            }
          }
        }
      }

      // Also check type aliases that resolve to branded types
      const symbol = tsType.getSymbol() || tsType.aliasSymbol;
      if (symbol) {
        const name = symbol.getName();
        if (BRANDED_TYPES.has(name)) {
          return name;
        }
      }

      return null;
    }

    /**
     * Check if an expression is a simple arithmetic operation involving an identifier.
     * Returns the operand identifiers if found.
     * @param {import('estree').Node} node
     * @returns {import('estree').Identifier[]}
     */
    function getArithmeticOperands(node) {
      const identifiers = [];

      if (node.type === 'BinaryExpression') {
        const arithmeticOps = ['+', '-', '*', '/', '%', '**'];
        if (arithmeticOps.includes(node.operator)) {
          if (node.left.type === 'Identifier') {
            identifiers.push(node.left);
          } else if (node.left.type === 'BinaryExpression') {
            identifiers.push(...getArithmeticOperands(node.left));
          }
          if (node.right.type === 'Identifier') {
            identifiers.push(node.right);
          } else if (node.right.type === 'BinaryExpression') {
            identifiers.push(...getArithmeticOperands(node.right));
          }
        }
      }

      return identifiers;
    }

    /**
     * Check if the node is inside an explicit conversion method (e.g., fromBlockNumber, fromCheckpointNumber).
     * These methods are the only valid place to do branded type conversions.
     * @param {import('estree').Node} node
     * @returns {boolean}
     */
    function isInsideExplicitConversionMethod(node) {
      const ancestors = context.sourceCode.getAncestors(node);
      for (const ancestor of ancestors) {
        // Check for function expressions assigned to BrandedType.from*
        if (ancestor.type === 'AssignmentExpression') {
          const left = ancestor.left;
          if (
            left.type === 'MemberExpression' &&
            left.object.type === 'Identifier' &&
            BRANDED_TYPES.has(left.object.name) &&
            left.property.type === 'Identifier' &&
            left.property.name.startsWith('from')
          ) {
            return true;
          }
        }

        // Check for method definitions with 'from' prefix
        if (ancestor.type === 'MethodDefinition' || ancestor.type === 'Property') {
          const key = ancestor.key;
          if (key && key.type === 'Identifier' && key.name.startsWith('from')) {
            return true;
          }
        }

        // Check for function declarations with 'from' prefix
        if (ancestor.type === 'FunctionDeclaration' && ancestor.id && ancestor.id.name.startsWith('from')) {
          return true;
        }
      }
      return false;
    }

    return {
      // Check function calls like CheckpointNumber(blockNumber)
      CallExpression(node) {
        // Skip if we're inside an explicit conversion method
        if (isInsideExplicitConversionMethod(node)) {
          return;
        }

        // Check if the callee is a known branded type factory function
        const callee = node.callee;
        let targetTypeName = null;

        if (callee.type === 'Identifier' && BRANDED_TYPES.has(callee.name)) {
          targetTypeName = callee.name;
        } else if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
          // Skip explicit conversion methods like BlockNumber.fromCheckpointNumber
          if (
            callee.property.type === 'Identifier' &&
            (callee.property.name.startsWith('from') ||
              callee.property.name === 'fromBigInt' ||
              callee.property.name === 'fromString')
          ) {
            return;
          }
        }

        if (!targetTypeName || node.arguments.length === 0) {
          return;
        }

        const arg = node.arguments[0];

        // Check if the argument is a branded type using the type checker
        if (checker && parserServices) {
          try {
            const tsNode = parserServices.esTreeNodeToTSNodeMap.get(arg);
            const argType = checker.getTypeAtLocation(tsNode);
            const sourceTypeName = getBrandedTypeName(argType);

            if (sourceTypeName && sourceTypeName !== targetTypeName) {
              context.report({
                node: arg,
                messageId: 'unsafeBrandedConversion',
                data: {
                  sourceType: sourceTypeName,
                  targetType: targetTypeName,
                  sourceTypeName: sourceTypeName,
                },
              });
              return;
            }

            // Bonus: Check for arithmetic expressions involving branded types
            if (arg.type === 'BinaryExpression') {
              const operands = getArithmeticOperands(arg);
              for (const operand of operands) {
                const operandTsNode = parserServices.esTreeNodeToTSNodeMap.get(operand);
                const operandType = checker.getTypeAtLocation(operandTsNode);
                const operandBrand = getBrandedTypeName(operandType);

                if (operandBrand && operandBrand !== targetTypeName) {
                  context.report({
                    node: arg,
                    messageId: 'unsafeBrandedArithmetic',
                    data: {
                      sourceType: operandBrand,
                      targetType: targetTypeName,
                    },
                  });
                  return;
                }
              }
            }
          } catch {
            // Fall through to AST-based checking
          }
        }

        // Fallback: AST-based checking (less accurate but still catches obvious cases)
        if (arg.type === 'Identifier') {
          // We can't determine the type from AST alone without the type checker
          // But we can flag suspicious patterns where the argument name suggests a different type
          const argName = arg.name.toLowerCase();
          for (const brandedType of BRANDED_TYPES) {
            if (brandedType !== targetTypeName) {
              const lowerBrandedType = brandedType.toLowerCase();
              // Check if the argument name contains a different branded type name
              if (argName.includes(lowerBrandedType) || argName === lowerBrandedType) {
                context.report({
                  node: arg,
                  messageId: 'unsafeBrandedConversion',
                  data: {
                    sourceType: brandedType,
                    targetType: targetTypeName,
                    sourceTypeName: brandedType,
                  },
                });
                return;
              }
            }
          }
        }
      },

      // Check type assertions like `blockNumber as CheckpointNumber`
      TSAsExpression(node) {
        // Skip if we're inside an explicit conversion method
        if (isInsideExplicitConversionMethod(node)) {
          return;
        }

        const typeAnnotation = node.typeAnnotation;

        // Get the target type name from the assertion
        let targetTypeName = null;
        if (typeAnnotation.type === 'TSTypeReference' && typeAnnotation.typeName.type === 'Identifier') {
          const name = typeAnnotation.typeName.name;
          if (BRANDED_TYPES.has(name)) {
            targetTypeName = name;
          }
        }

        if (!targetTypeName) {
          return;
        }

        // Get the source type
        const expression = node.expression;

        // Handle `as unknown as BrandedType` pattern
        if (expression.type === 'TSAsExpression') {
          // This is a chained assertion, check the innermost expression
          const innerExpr = expression.expression;

          if (checker && parserServices) {
            try {
              const tsNode = parserServices.esTreeNodeToTSNodeMap.get(innerExpr);
              const sourceType = checker.getTypeAtLocation(tsNode);
              const sourceTypeName = getBrandedTypeName(sourceType);

              if (sourceTypeName && sourceTypeName !== targetTypeName) {
                context.report({
                  node,
                  messageId: 'unsafeBrandedAssertion',
                  data: {
                    sourceType: sourceTypeName,
                    targetType: targetTypeName,
                  },
                });
                return;
              }
            } catch {
              // Fall through
            }
          }
        }

        // Check direct assertions
        if (checker && parserServices) {
          try {
            const tsNode = parserServices.esTreeNodeToTSNodeMap.get(expression);
            const sourceType = checker.getTypeAtLocation(tsNode);
            const sourceTypeName = getBrandedTypeName(sourceType);

            if (sourceTypeName && sourceTypeName !== targetTypeName) {
              context.report({
                node,
                messageId: 'unsafeBrandedAssertion',
                data: {
                  sourceType: sourceTypeName,
                  targetType: targetTypeName,
                },
              });
              return;
            }
          } catch {
            // Fall through to AST-based checking
          }
        }

        // Fallback: AST-based checking for obvious cases
        if (expression.type === 'Identifier') {
          const exprName = expression.name.toLowerCase();
          for (const brandedType of BRANDED_TYPES) {
            if (brandedType !== targetTypeName) {
              const lowerBrandedType = brandedType.toLowerCase();
              if (exprName.includes(lowerBrandedType) || exprName === lowerBrandedType) {
                context.report({
                  node,
                  messageId: 'unsafeBrandedAssertion',
                  data: {
                    sourceType: brandedType,
                    targetType: targetTypeName,
                  },
                });
                return;
              }
            }
          }
        }
      },
    };
  },
};
