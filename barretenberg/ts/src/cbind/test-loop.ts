#!/usr/bin/env node
import { NativeApi } from './generated-bkup/nativebk.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

async function testLoop() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const bbPath = join(__dirname, '..', '..', '..', 'cpp', 'build-no-avm', 'bin', 'bb');

  console.log('Using bb binary at:', bbPath);

  if (!existsSync(bbPath)) {
    console.error('bb binary not found at:', bbPath);
    return;
  }

  // Just test once for now to debug
  const iterations = 1;

  for (let i = 0; i < iterations; i++) {
    console.log(`\n=== Iteration ${i + 1} ===`);

    try {
      console.log('Creating API...');
      const api = await NativeApi.new(bbPath);
      console.log('✓ API created');

      // Add timeout for the command
      console.log('Sending clientIvcStart command...');

      // Log what we're sending
      const { Encoder } = await import('msgpackr');
      const encoder = new Encoder();
      const testCommand = ["ClientIvcStart", { num_circuits: 2 }];
      console.log('Command structure:', testCommand);
      console.log('Encoded length:', encoder.encode(testCommand).length);

      const responsePromise = api.clientIvcStart({ numCircuits: 2 });

      const response = await Promise.race([
        responsePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Command timed out after 5s')), 5000)
        )
      ]);

      console.log('✓ clientIvcStart response:', response);

      await api.close();
      console.log('✓ API closed');

      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error('Error in iteration', i + 1, ':', error);
    }
  }

  console.log('\n=== All iterations completed ===');
}

testLoop().catch(console.error);
