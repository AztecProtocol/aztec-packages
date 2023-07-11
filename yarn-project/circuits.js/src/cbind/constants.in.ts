import * as fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CPP_FILE_PATH = join(__dirname, '../../../../circuits/cpp/src/aztec3/constants.hpp');
const TS_FILE_PATH = join(__dirname, '/constants.gen.ts');

/**
 * Convert the C++ constants to TypeScript.
 */
function convertToTypeScript(): void {
  let content: string = fs.readFileSync(CPP_FILE_PATH, 'utf-8');

  // Extract the relevant code
  content = content.split('TS-RELEVANT-CODE-START')[1].split('// TS-RELEVANT-CODE-END')[0];

  // Remove C++ comments
  content = content.replace(/\/\/.*/g, '');
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove "static_cast<size_t>( )""
  content = content.replace(/static_cast<size_t>\(log2\([^)]+\)/g, match => {
    const innerContent = match.substring(20, match.length - 1); // Extract content inside log2()
    return `${innerContent}`;
  });

  content = content.replace(/size_t/g, '');

  // Replace namespace
  content = content.replace(/namespace (\w+) {/g, 'export namespace $1 {');
  content = content.replace(/}  \/\/ namespace (\w+)/g, '}');

  // Replace constexpr
  content = content.replace(/constexpr/g, 'export const');

  // Replace enum
  content = content.replace(/enum (\w+)/g, 'export enum $1');

  // Replace comments inside enum
  content = content.replace(/\/\*.*?\*\//g, '');

  // Replace semicolons at the end of lines
  content = content.replace(/;/g, '');

  // Remove empty lines
  content = content.replace(/\n\s*\n/g, '\n');

  // Inject the log2 function
  content =
    'function log2(input: number): number {return (input < 2) ? 0 : 1 + log2(Math.floor(input / 2));}' + content;

  // Add TypeScript file extension
  content = '/* eslint-disable */\n' + content;
  content = content.replace(/\n/g, '\n');

  fs.writeFileSync(TS_FILE_PATH, content);
}

convertToTypeScript();
