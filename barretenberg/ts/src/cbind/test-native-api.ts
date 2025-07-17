#!/usr/bin/env node
import { NativeApi } from './generated/native.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Path to bb binary
  const bbPath = join(__dirname, '..', '..', '..', 'cpp', 'build-no-avm', 'bin', 'bb');

  console.log('Using bb binary at:', bbPath);

  let api: NativeApi | undefined;
  
  try {
    // Initialize the bb process
    console.log('Initializing bb process...');
    api = await NativeApi.new(bbPath);
    console.log('✓ bb process initialized');

    // Call clientIvcStart with 2 circuits
    console.log('\nCalling clientIvcStart with numCircuits: 2...');

    // Add debug logging to see the actual msgpack structure
    const { Encoder } = await import('msgpackr');
    const encoder = new Encoder({ useRecords: false });

    const startResponse = await api.clientIvcStart({ numCircuits: 2 });
    console.log('✓ clientIvcStart response:', startResponse);

    // The response should be an empty object for ClientIvcStartResponse
    console.log('\nResponse type check:', typeof startResponse === 'object' && Object.keys(startResponse).length === 0 ? 'PASS' : 'FAIL');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Clean up
    if (api) {
      console.log('\nClosing bb process...');
      await api.close();
      console.log('✓ bb process closed');
    }
  }
}

main().catch(console.error);
