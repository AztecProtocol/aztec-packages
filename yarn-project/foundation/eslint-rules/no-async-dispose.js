// @ts-check

/**
 * @fileoverview Rule to disallow async [Symbol.dispose]() methods.
 * Use [Symbol.asyncDispose]() with AsyncDisposable instead.
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow async [Symbol.dispose]() methods',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      asyncDispose: '[Symbol.dispose]() should not be async. Use [Symbol.asyncDispose]() with AsyncDisposable instead.',
    },
    schema: [],
  },

  create(context) {
    return {
      MethodDefinition(node) {
        // Match computed property keys like [Symbol.dispose]
        if (!node.computed || !node.key || node.key.type !== 'MemberExpression') {
          return;
        }

        const key = node.key;
        if (
          key.object.type !== 'Identifier' ||
          key.object.name !== 'Symbol' ||
          key.property.type !== 'Identifier' ||
          key.property.name !== 'dispose'
        ) {
          return;
        }

        // Check if the method is async
        if (node.value.async) {
          context.report({ node, messageId: 'asyncDispose' });
          return;
        }

        // Check if the return type annotation contains Promise
        // @ts-expect-error returnType is a typescript-eslint AST extension
        const returnType = node.value.returnType?.typeAnnotation;
        if (
          returnType &&
          returnType.type === 'TSTypeReference' &&
          returnType.typeName?.type === 'Identifier' &&
          returnType.typeName.name === 'Promise'
        ) {
          context.report({ node, messageId: 'asyncDispose' });
        }
      },
    };
  },
};
