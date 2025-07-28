// @ts-check
import * as ts from 'typescript';

/**
 * @fileoverview Rule to disallow non-primitive types in Set<T> and Map<T, ...> collections
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow non-primitive types in Set<T> and Map<T, ...> collections',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      nonPrimitiveInSet: 'Set should only be used with primitive types. Found Set<{{type}}>',
      nonPrimitiveInMapKey: 'Map keys should only be primitive types. Found Map<{{type}}, ...>',
    },
    schema: [],
  },

  create(context) {
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
    } catch (e) {
      // TypeScript services not available, fall back to AST-only checking
    }

    /**
     * Check if a TypeScript type is allowed (using type checker)
     */
    function isAllowedTypeWithChecker(tsType) {
      if (!tsType) return false;

      // Check for primitive types
      const flags = tsType.getFlags();
      const primitiveFlags =
        ts.TypeFlags.String |
        ts.TypeFlags.Number |
        ts.TypeFlags.BigInt |
        ts.TypeFlags.Boolean |
        ts.TypeFlags.Undefined |
        ts.TypeFlags.Null |
        ts.TypeFlags.ESSymbol |
        ts.TypeFlags.Any |
        ts.TypeFlags.Unknown |
        ts.TypeFlags.Never |
        ts.TypeFlags.Void;

      if (flags & primitiveFlags) {
        return true;
      }

      // Check for literal types (string literals, number literals, etc.)
      if (flags & ts.TypeFlags.Literal) {
        return true;
      }

      // Check for template literal types (e.g., `0x${string}`)
      if (flags & ts.TypeFlags.TemplateLiteral) {
        return true;
      }

      // Check for string mapping types (template literal patterns)
      if (flags & ts.TypeFlags.StringMapping) {
        return true;
      }

      // Check for enums
      if (flags & ts.TypeFlags.Enum) {
        return true;
      }

      // Check for enum literal types
      if (flags & ts.TypeFlags.EnumLiteral) {
        return true;
      }

      // Check for type parameters (generics)
      if (flags & ts.TypeFlags.TypeParameter) {
        return true;
      }

      // Check for union types - all members must be allowed
      if (flags & ts.TypeFlags.Union) {
        if (tsType.isUnion && tsType.isUnion()) {
          return tsType.types.every(t => isAllowedTypeWithChecker(t));
        }
      }

      return false;
    }

    /**
     * Fallback: Check if a type node represents a primitive type (AST-only)
     * This is only used if TypeScript type checker is not available
     */
    function isPrimitiveTypeNodeFallback(typeNode) {
      if (!typeNode) return false;

      switch (typeNode.type) {
        case 'TSStringKeyword':
        case 'TSNumberKeyword':
        case 'TSBigIntKeyword':
        case 'TSBooleanKeyword':
        case 'TSSymbolKeyword':
        case 'TSUndefinedKeyword':
        case 'TSNullKeyword':
        case 'TSAnyKeyword':
        case 'TSUnknownKeyword':
        case 'TSVoidKeyword':
        case 'TSNeverKeyword':
          return true;

        case 'TSTypeParameter':
          return true;

        case 'TSLiteralType':
        case 'TSTemplateLiteralType':
          return true;

        case 'TSUnionType':
          return typeNode.types.every(t => isPrimitiveTypeNodeFallback(t));

        case 'TSTypeReference':
          if (typeNode.typeName && typeNode.typeName.type === 'Identifier') {
            const name = typeNode.typeName.name;

            // Single uppercase letters (type parameters)
            if (name.length === 1 && name === name.toUpperCase()) {
              return true;
            }

            // Basic primitive type names
            const primitives = ['string', 'number', 'bigint', 'boolean', 'symbol', 'undefined', 'null'];
            if (primitives.includes(name)) {
              return true;
            }
          }
          return false;

        default:
          return false;
      }
    }

    /**
     * Get a readable type name from a type node
     */
    function getTypeName(typeNode) {
      if (!typeNode) return 'unknown';

      try {
        const sourceCode = context.getSourceCode();
        return sourceCode.getText(typeNode);
      } catch (e) {
        return 'unknown';
      }
    }

    return {
      TSTypeReference(node) {
        if (!node.typeName || node.typeName.type !== 'Identifier') {
          return;
        }

        const typeName = node.typeName.name;

        // Check for Set<T>
        if (typeName === 'Set' && node.typeArguments?.params?.length > 0) {
          const typeParam = node.typeArguments.params[0];
          let isAllowed = false;
          let typeStr = getTypeName(typeParam);

          // Use type checker if available
          if (checker && parserServices) {
            try {
              const tsNode = parserServices.esTreeNodeToTSNodeMap.get(typeParam);
              const tsType = checker.getTypeAtLocation(tsNode);
              isAllowed = isAllowedTypeWithChecker(tsType);
              typeStr = checker.typeToString(tsType);
            } catch (e) {
              // Fall back to AST checking
              isAllowed = isPrimitiveTypeNodeFallback(typeParam);
            }
          } else {
            // Use AST-only checking as fallback
            isAllowed = isPrimitiveTypeNodeFallback(typeParam);
          }

          if (!isAllowed) {
            context.report({
              node,
              messageId: 'nonPrimitiveInSet',
              data: {
                type: typeStr,
              },
            });
          }
        }

        // Check for Map<K, V>
        if (typeName === 'Map' && node.typeArguments?.params?.length > 0) {
          const keyTypeParam = node.typeArguments.params[0];
          let isAllowed = false;
          let typeStr = getTypeName(keyTypeParam);

          // Use type checker if available
          if (checker && parserServices) {
            try {
              const tsNode = parserServices.esTreeNodeToTSNodeMap.get(keyTypeParam);
              const tsType = checker.getTypeAtLocation(tsNode);
              isAllowed = isAllowedTypeWithChecker(tsType);
              typeStr = checker.typeToString(tsType);
            } catch (e) {
              // Fall back to AST checking
              isAllowed = isPrimitiveTypeNodeFallback(keyTypeParam);
            }
          } else {
            // Use AST-only checking as fallback
            isAllowed = isPrimitiveTypeNodeFallback(keyTypeParam);
          }

          if (!isAllowed) {
            context.report({
              node,
              messageId: 'nonPrimitiveInMapKey',
              data: {
                type: typeStr,
              },
            });
          }
        }
      },
    };
  },
};
