#!/usr/bin/env node
import generatorModule from '@babel/generator';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';
import fg from 'fast-glob';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const generate = generatorModule.default || generatorModule;
const traverse = traverseModule.default || traverseModule;

const parserOpts = filename => ({
  sourceType: 'unambiguous',
  sourceFilename: filename,
  plugins: [
    'typescript',
    'jsx',
    'decorators-legacy',
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'dynamicImport',
    'importMeta',
    'topLevelAwait',
    'objectRestSpread',
    'optionalChaining',
    'nullishCoalescingOperator',
    'importAttributes',
    'explicitResourceManagement',
  ],
});

const isESM = program =>
  program.body.some(
    n =>
      t.isImportDeclaration(n) ||
      t.isExportNamedDeclaration(n) ||
      t.isExportDefaultDeclaration(n) ||
      t.isExportAllDeclaration(n),
  );

const hasProfImport = program =>
  program.body.some(n => {
    if (t.isImportDeclaration(n)) {
      return n.specifiers.some(s => t.isImportNamespaceSpecifier(s) && s.local.name === '__prof');
    }
    if (t.isVariableDeclaration(n)) {
      return n.declarations.some(
        d =>
          t.isIdentifier(d.id, { name: '__prof' }) &&
          d.init &&
          t.isCallExpression(d.init) &&
          t.isIdentifier(d.init.callee, { name: 'require' }),
      );
    }
    return false;
  });

const insertProfImport = (program, runtimeModule, esmPreferred) => {
  if (hasProfImport(program)) return;
  let insertAt = 0;
  while (
    insertAt < program.body.length &&
    t.isExpressionStatement(program.body[insertAt]) &&
    t.isStringLiteral(program.body[insertAt].expression)
  )
    insertAt++;
  if (esmPreferred) {
    program.body.splice(
      insertAt,
      0,
      t.importDeclaration(
        [t.importSpecifier(t.identifier('__prof'), t.identifier('profiler'))],
        t.stringLiteral(runtimeModule),
      ),
    );
  } else {
    program.body.splice(
      insertAt,
      0,
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__prof'),
          t.memberExpression(
            t.callExpression(t.identifier('require'), [t.stringLiteral(runtimeModule)]),
            t.identifier('profiler'),
          ),
        ),
      ]),
    );
  }
};

const alreadyInstrumented = fnBody => {
  if (!fnBody || !t.isBlockStatement(fnBody)) return false;
  return fnBody.body.some(s => {
    if (t.isReturnStatement(s) && s.argument && t.isCallExpression(s.argument)) {
      const callee = s.argument.callee;
      return (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.object, { name: '__prof' }) &&
        t.isIdentifier(callee.property, { name: 'runAsync' })
      );
    }
    return false;
  });
};

const getFunctionName = path => {
  const { node } = path;
  if (t.isFunctionDeclaration(node) && node.id) return node.id.name;
  if (
    (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) &&
    path.parentPath?.isVariableDeclarator() &&
    t.isIdentifier(path.parentPath.node.id)
  ) {
    return path.parentPath.node.id.name;
  }
  if (t.isObjectMethod(node)) {
    const k = node.key;
    return t.isIdentifier(k) ? k.name : t.isStringLiteral(k) ? k.value : 'method';
  }
  if (t.isClassMethod(node) || t.isClassPrivateMethod(node)) {
    let nm = t.isPrivateName(node.key)
      ? node.key.id.name || 'method'
      : t.isIdentifier(node.key)
        ? node.key.name
        : t.isStringLiteral(node.key)
          ? node.key.value
          : 'method';
    const cls = path.findParent(p => p.isClassDeclaration() || p.isClassExpression());
    if (cls && cls.node && t.isClassDeclaration(cls.node) && cls.node.id) {
      nm = `${cls.node.id.name}.${nm}`;
    }
    return nm;
  }
  return null;
};

const ensureBlockForArrow = node => {
  if (t.isArrowFunctionExpression(node) && !t.isBlockStatement(node.body)) {
    node.body = t.blockStatement([t.returnStatement(node.body)]);
  }
};

const hash10 = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

function instrumentFunction(fnPath, fileRel) {
  const { node } = fnPath;
  if (!node.async) return false;

  // Skip async generator functions (async *)
  if (node.generator) return false;

  // Skip if this is our own wrapper function
  if (node._skipInstrumentation) return false;

  // Arrow: ensure block
  if (t.isArrowFunctionExpression(node)) ensureBlockForArrow(node);

  const body = node.body;
  if (!t.isBlockStatement(body)) return false;
  if (alreadyInstrumented(body)) return false;

  const name = getFunctionName(fnPath) || 'anon';
  const line = node.loc?.start?.line != null ? `L${node.loc.start.line}` : 'L?';
  const label = `${fileRel}#${name}@${line}`;

  const original = body.body;

  const asyncWrapper = t.arrowFunctionExpression(
    [],
    t.blockStatement(original),
    true, // async
  );
  // Mark this wrapper so we don't instrument it recursively
  asyncWrapper._skipInstrumentation = true;

  const runAsyncCall = t.callExpression(t.memberExpression(t.identifier('__prof'), t.identifier('runAsync')), [
    t.stringLiteral(label),
    asyncWrapper,
  ]);

  node.body = t.blockStatement([t.returnStatement(t.awaitExpression(runAsyncCall))]);

  return true;
}

async function processFile(file, runtimeModule) {
  const src = await fs.readFile(file, 'utf8');
  const ast = parse(src, parserOpts(file));
  const fileRel = path.relative(process.cwd(), file).replace(/\\/g, '/');

  let changed = false;
  traverse(ast, {
    FunctionDeclaration(p) {
      changed |= instrumentFunction(p, fileRel);
    },
    FunctionExpression(p) {
      changed |= instrumentFunction(p, fileRel);
    },
    ArrowFunctionExpression(p) {
      changed |= instrumentFunction(p, fileRel);
    },
    ObjectMethod(p) {
      changed |= instrumentFunction(p, fileRel);
    },
    ClassMethod(p) {
      changed |= instrumentFunction(p, fileRel);
    },
    ClassPrivateMethod(p) {
      changed |= instrumentFunction(p, fileRel);
    },
  });

  if (changed) {
    const prog = ast.program;
    insertProfImport(prog, runtimeModule, isESM(prog));
    const { code } = generate(
      ast,
      {
        sourceMaps: true,
        sourceFileName: file,
        // Optional knobs:
        retainLines: false,
        compact: false,
        decoratorsBeforeExport: true,
      },
      src,
    );
    if (code !== src) {
      await fs.writeFile(file, code, 'utf8');
      return true;
    }
  }
  return false;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node edit.mjs "<glob1>" ["<glob2>" ...]');
    process.exit(1);
  }
  return { patterns: args };
}

(async () => {
  const { patterns } = parseArgs(process.argv);
  const runtimeModule = '@aztec/foundation/profiler';
  const files = await fg(patterns, {
    onlyFiles: true,
    unique: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.instrumented/**'],
  });

  if (!files.length) {
    console.log('No files matched.');
    return;
  }

  let changedFiles = 0;
  for (const f of files) {
    const changed = await processFile(f, runtimeModule);
    if (changed) changedFiles++;
  }
  console.log(`Instrumented ${changedFiles} file(s).`);
})();
