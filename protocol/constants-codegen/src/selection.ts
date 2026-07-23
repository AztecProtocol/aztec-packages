import { readFileSync } from 'node:fs';

import type { ParsedContent } from './generator.ts';

/** Source symbols to include in one generated output. */
export interface SymbolSelection {
  constants: string[];
  domainSeparators: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Symbol names contain no regex metacharacters, so any entry that is not a
// valid name can only be intended as a pattern.
function isExactName(entry: string): boolean {
  return /^[A-Za-z_]\w*$/.test(entry);
}

function compilePattern(entry: string): RegExp {
  return new RegExp(`^(?:${entry})$`);
}

function readSymbolList(value: unknown, property: keyof SymbolSelection, path: string): string[] {
  if (!Array.isArray(value) || !value.every(symbol => typeof symbol === 'string')) {
    throw new Error(`'${property}' in ${path} must be an array of strings`);
  }

  for (const symbol of value) {
    if (!isExactName(symbol)) {
      try {
        compilePattern(symbol);
      } catch {
        throw new Error(`invalid ${property} pattern '${symbol}' in ${path}`);
      }
    }
  }

  const duplicate = value.find((symbol, index) => value.indexOf(symbol) !== index);
  if (duplicate) {
    throw new Error(`duplicate ${property} symbol '${duplicate}' in ${path}`);
  }

  return value;
}

/** Reads and validates a symbol selection JSON file. */
export function readSymbolSelection(path: string): SymbolSelection {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`could not read selection ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(value)) {
    throw new Error(`selection ${path} must be a JSON object`);
  }

  const unexpectedProperty = Object.keys(value).find(
    property => property !== 'constants' && property !== 'domainSeparators',
  );
  if (unexpectedProperty) {
    throw new Error(`unknown property '${unexpectedProperty}' in selection ${path}`);
  }

  return {
    constants: readSymbolList(value.constants, 'constants', path),
    domainSeparators: readSymbolList(value.domainSeparators, 'domainSeparators', path),
  };
}

function selectRecord<T>(record: Record<string, T>, entries: string[], kind: string): Record<string, T> {
  const selected = new Set<string>();
  for (const entry of entries) {
    if (isExactName(entry)) {
      if (!Object.hasOwn(record, entry)) {
        throw new Error(`unknown ${kind} '${entry}' in selection`);
      }
      selected.add(entry);
    } else {
      const pattern = compilePattern(entry);
      const matches = Object.keys(record).filter(symbol => pattern.test(symbol));
      if (matches.length === 0) {
        throw new Error(`pattern '${entry}' in selection matched no ${kind}s`);
      }
      matches.forEach(symbol => selected.add(symbol));
    }
  }

  return Object.fromEntries(Object.entries(record).filter(([symbol]) => selected.has(symbol)));
}

/** Filters parsed Noir content to the symbols requested for one output. */
export function selectSymbols(content: ParsedContent, selection: SymbolSelection): ParsedContent {
  return {
    constants: selectRecord(content.constants, selection.constants, 'constant'),
    domainSeparatorEnum: selectRecord(content.domainSeparatorEnum, selection.domainSeparators, 'domain separator'),
  };
}
