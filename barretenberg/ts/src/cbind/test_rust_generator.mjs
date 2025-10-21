#!/usr/bin/env node
/**
 * Test script to see what the Rust generator produces
 */

import { createRustCompiler } from './rust_schema_compiler.js';

const testSchema = {
  commands: [
    'named_union',
    [
      ['Blake2s', { __typename: 'blake2s_command', data: ['vector', ['unsigned char']] }],
      [
        'PedersenHash',
        {
          __typename: 'pedersen_hash_command',
          inputs: ['vector', [['vector', ['unsigned char']]]],
          hash_index: 'unsigned int',
        },
      ],
    ],
  ],
  responses: [
    'named_union',
    [
      ['Blake2s', { __typename: 'blake2s_response', hash: ['vector', ['unsigned char']] }],
      ['PedersenHash', { __typename: 'pedersen_hash_response', hash: ['vector', ['unsigned char']] }],
    ],
  ],
};

const compiler = createRustCompiler();
compiler.processApiSchema(testSchema.commands, testSchema.responses);
const output = compiler.compile();

console.log('='.repeat(80));
console.log('Generated Rust Code:');
console.log('='.repeat(80));
console.log(output);
