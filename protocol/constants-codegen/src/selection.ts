import { readFileSync } from 'node:fs';

import type { ParsedContent } from './generator.ts';

/** Source symbols to include in one generated output. */
export type SymbolSelection = string[];

/** Conventional prefix for domain separators. */
const DOMAIN_SEPARATOR_PREFIX = 'DOM_SEP__';

// Symbol names contain no regex metacharacters, so any entry that is not a
// valid name can only be intended as a pattern.
function isExactName(entry: string): boolean {
  return /^[A-Za-z_]\w*$/.test(entry);
}

function compilePattern(entry: string): RegExp {
  return new RegExp(`^(?:${entry})$`);
}

/** Reads and validates a symbol selection JSON file. */
export function readSymbolSelection(path: string): SymbolSelection {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`could not read selection ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(`selection ${path} must be a JSON array of strings`);
  }

  for (const entry of value) {
    if (!isExactName(entry)) {
      try {
        compilePattern(entry);
      } catch {
        throw new Error(`invalid pattern '${entry}' in ${path}`);
      }
    }
  }

  const duplicate = value.find((entry, index) => value.indexOf(entry) !== index);
  if (duplicate) {
    throw new Error(`duplicate entry '${duplicate}' in ${path}`);
  }

  return value;
}

/** Filters parsed Noir content to the symbols requested for one output. */
export function selectSymbols(content: ParsedContent, selection: SymbolSelection): ParsedContent {
  const sourceNames = [
    ...Object.keys(content.constants),
    ...Object.keys(content.domainSeparatorEnum).map(name => DOMAIN_SEPARATOR_PREFIX + name),
  ];
  const sourceNameSet = new Set(sourceNames);

  const selected = new Set<string>();
  for (const entry of selection) {
    if (isExactName(entry)) {
      if (!sourceNameSet.has(entry)) {
        throw new Error(`unknown symbol '${entry}' in selection`);
      }
      selected.add(entry);
    } else {
      const pattern = compilePattern(entry);
      const matches = sourceNames.filter(name => pattern.test(name));
      if (matches.length === 0) {
        throw new Error(`pattern '${entry}' in selection matched no symbols`);
      }
      matches.forEach(name => selected.add(name));
    }
  }

  return {
    constants: Object.fromEntries(Object.entries(content.constants).filter(([name]) => selected.has(name))),
    domainSeparatorEnum: Object.fromEntries(
      Object.entries(content.domainSeparatorEnum).filter(([name]) => selected.has(DOMAIN_SEPARATOR_PREFIX + name)),
    ),
  };
}
