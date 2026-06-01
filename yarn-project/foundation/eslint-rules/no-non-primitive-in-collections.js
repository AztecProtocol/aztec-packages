// @ts-check
import * as ts from 'typescript';

/**
 * @fileoverview Rule to disallow non-primitive types in Set<T> and Map<T, ...> collections
 */

/**
 * Branded primitive types whose underlying representation is a primitive (number/string/etc.)
 * and are therefore safe to use as Set/Map keys. Used as a fallback when the TypeScript type
 * checker is unavailable (AST-only mode). The type-checker path detects these structurally
 * via the `Branded<T, Brand>` intersection encoding, so this list only needs to cover the
 * names — not their full definitions.
 */
const BRANDED_PRIMITIVE_TYPES = new Set([
  'BlockNumber',
  'SlotNumber',
  'CheckpointNumber',
  'EpochNumber',
  'IndexWithinCheckpoint',
]);

const ARRAY_MEMBERSHIP_METHODS = new Set(['includes', 'indexOf', 'lastIndexOf']);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow non-primitive types in Set<T>, Map<T, ...>, and Array.prototype.{includes,indexOf,lastIndexOf} membership checks',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      nonPrimitiveInSet: 'Set should only be used with primitive types. Found Set<{{type}}>',
      nonPrimitiveInMapKey: 'Map keys should only be primitive types. Found Map<{{type}}, ...>',
      nonPrimitiveInArrayMembership:
        'Array.prototype.{{method}} uses SameValueZero (reference equality for objects) and will silently miss equal-but-distinct class instances. Use .some(x => x.equals(target)) or project to a primitive (e.g. .map(x => x.toString())) first. Element type: {{type}}',
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

      // Check for branded primitive types: T & { _branding: Brand } where T is a primitive.
      // Permits SlotNumber, BlockNumber, etc. while still rejecting branded class types
      // such as BlockProposalHash = Branded<BaseBuffer32, ...>.
      if (flags & ts.TypeFlags.Intersection) {
        if (tsType.isIntersection && tsType.isIntersection()) {
          return isBrandedPrimitive(tsType);
        }
      }

      return false;
    }

    /**
     * Detect a Branded<Primitive, Brand> intersection. The intersection must contain
     * at least one primitive constituent and all non-primitive constituents must be
     * the brand marker object (a single `_branding` property and nothing else).
     */
    function isBrandedPrimitive(tsType) {
      const components = tsType.types;
      if (!components || components.length === 0) return false;

      const allowedPrimitiveFlags =
        ts.TypeFlags.String |
        ts.TypeFlags.Number |
        ts.TypeFlags.BigInt |
        ts.TypeFlags.Boolean |
        ts.TypeFlags.ESSymbol |
        ts.TypeFlags.Literal |
        ts.TypeFlags.TemplateLiteral |
        ts.TypeFlags.StringMapping |
        ts.TypeFlags.Enum |
        ts.TypeFlags.EnumLiteral;

      let hasPrimitive = false;
      let hasBrandMarker = false;

      for (const component of components) {
        const componentFlags = component.getFlags();
        if (componentFlags & allowedPrimitiveFlags) {
          hasPrimitive = true;
          continue;
        }
        if (componentFlags & ts.TypeFlags.Object) {
          const props = component.getProperties ? component.getProperties() : [];
          if (props.length === 1 && props[0].getName() === '_branding') {
            hasBrandMarker = true;
            continue;
          }
        }
        return false;
      }

      return hasPrimitive && hasBrandMarker;
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

            // Branded primitives that wrap number/string — safe to use as keys
            if (BRANDED_PRIMITIVE_TYPES.has(name)) {
              return true;
            }
          }
          return false;

        default:
          return false;
      }
    }

    /**
     * Heuristic: does this type expose an `equals` method? Types that do are opting into value
     * equality (Fr, AztecAddress, TxHash, ...) — and using SameValueZero membership checks on
     * arrays of them is almost always a bug. Types without `equals` (callback function types,
     * AbortController, plain objects) are typically used with reference equality intentionally.
     */
    function hasEqualsMethod(tsType) {
      if (!tsType || !tsType.getProperty) return false;
      const equalsSymbol = tsType.getProperty('equals');
      if (!equalsSymbol) return false;
      const decls = equalsSymbol.getDeclarations?.() ?? [];
      return decls.some(d => ts.isMethodDeclaration(d) || ts.isMethodSignature(d));
    }

    /**
     * Extract the element type of an Array<T> / ReadonlyArray<T> / T[] / readonly T[].
     * Returns undefined for non-array receivers (e.g. `string`, which also has a `.includes` method).
     */
    function getArrayElementType(tsType) {
      if (!tsType) return undefined;

      if (typeof checker.getElementTypeOfArrayType === 'function') {
        const elem = checker.getElementTypeOfArrayType(tsType);
        if (elem) return elem;
      }

      const symbol = tsType.getSymbol ? tsType.getSymbol() : undefined;
      const name = symbol?.getName?.();
      if (name === 'Array' || name === 'ReadonlyArray') {
        return tsType.typeArguments?.[0] ?? tsType.aliasTypeArguments?.[0];
      }

      return undefined;
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

      CallExpression(node) {
        // We need the type checker to know whether the receiver is an array of class instances.
        // In AST-only fallback mode we can't reliably distinguish `addrs.includes(x)` (bug)
        // from `["a","b"].includes(x)` (fine), so we skip rather than risk false positives.
        if (!checker || !parserServices) {
          return;
        }

        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) {
          return;
        }
        if (callee.property.type !== 'Identifier' || !ARRAY_MEMBERSHIP_METHODS.has(callee.property.name)) {
          return;
        }
        if (node.arguments.length === 0) {
          return;
        }

        try {
          const receiverTsNode = parserServices.esTreeNodeToTSNodeMap.get(callee.object);
          const receiverType = checker.getTypeAtLocation(receiverTsNode);
          const elementType = getArrayElementType(receiverType);
          if (!elementType) {
            // Not an array (e.g. `string.includes`, or an unknown receiver) — leave alone.
            return;
          }
          if (isAllowedTypeWithChecker(elementType)) {
            return;
          }
          // Only flag types that opted into value equality. Arrays of callbacks / DOM types /
          // plain function types are commonly searched via reference identity on purpose.
          if (!hasEqualsMethod(elementType)) {
            return;
          }

          context.report({
            node,
            messageId: 'nonPrimitiveInArrayMembership',
            data: {
              method: callee.property.name,
              type: checker.typeToString(elementType),
            },
          });
        } catch (e) {
          // Type information unavailable for this node — skip silently.
        }
      },
    };
  },
};
