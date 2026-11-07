// One-shot TikZ → SVG renderer using node-tikzjax (a WASM port of
// TikZJax). Called from build.sh. node-tikzjax is resolved from .build/
// so the diagrams directory stays free of node_modules.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '.build', 'package.json'));
const tex2svg = require('node-tikzjax').default;

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: node render-tikzjax.mjs <input.tex> <output.svg>');
  process.exit(2);
}

let src = fs.readFileSync(inputPath, 'utf8');
// node-tikzjax supplies its own \documentclass{standalone}; strip ours.
src = src.replace(/^\s*\\documentclass[^\n]*\n/m, '');

try {
  const svg = await tex2svg(src, {
    showConsole: false,
    embedFontCss: true,
    // amssymb is in the allowed list but not auto-loaded; needed for \mathbb.
    texPackages: { amssymb: '' },
  });
  fs.writeFileSync(outputPath, svg);
  process.stdout.write(`  ${(svg.length / 1024).toFixed(1)} KB written\n`);
} catch (err) {
  console.error('render-tikzjax: ' + (err.message || err));
  if (err.log) {
    fs.writeFileSync(outputPath + '.log', err.log);
    console.error('  log: ' + outputPath + '.log');
  }
  process.exit(1);
}
