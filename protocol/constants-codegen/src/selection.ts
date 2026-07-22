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

function readSymbolList(value: unknown, property: keyof SymbolSelection, path: string): string[] {
  if (!Array.isArray(value) || !value.every(symbol => typeof symbol === 'string')) {
    throw new Error(`'${property}' in ${path} must be an array of strings`);
  }

  for (const symbol of value) {
    if (!/^[A-Za-z_]\w*$/.test(symbol)) {
      throw new Error(`invalid ${property} symbol '${symbol}' in ${path}`);
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

function selectRecord<T>(record: Record<string, T>, symbols: string[], kind: string): Record<string, T> {
  const unknownSymbol = symbols.find(symbol => !Object.hasOwn(record, symbol));
  if (unknownSymbol) {
    throw new Error(`unknown ${kind} '${unknownSymbol}' in selection`);
  }

  const selected = new Set(symbols);
  return Object.fromEntries(Object.entries(record).filter(([symbol]) => selected.has(symbol)));
}

/** Filters parsed Noir content to the symbols requested for one output. */
export function selectSymbols(content: ParsedContent, selection: SymbolSelection): ParsedContent {
  return {
    constants: selectRecord(content.constants, selection.constants, 'constant'),
    domainSeparatorEnum: selectRecord(content.domainSeparatorEnum, selection.domainSeparators, 'domain separator'),
  };
}
