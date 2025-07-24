// #!/usr/bin/env node
import { NativeApi } from './generated/native.js';
import { IvcRunner, IvcInputs } from './ivc-inputs.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Test reading an actual ivc-inputs.msgpack file if it exists
async function testWithRealFile() {
  const realInputsPath = './ivc-inputs.msgpack';

  console.log('\n=== Testing with real ivc-inputs.msgpack file ===');

  const inputs = IvcInputs.fromFile(realInputsPath);
  console.log('✓ Successfully loaded', inputs.getStepCount(), 'steps');

  // If we have real data, we could test the actual IVC flow
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const bbPath = join(__dirname, '..', '..', '..', 'cpp', 'build-no-avm', 'bin', 'bb');

  if (existsSync(bbPath)) {
    console.log('\nTesting check precomputed VKs with native API...');
    const api = new NativeApi(bbPath);
    await api.init();

    const runner = new IvcRunner(api);
    runner.accumulateFromFile(realInputsPath);
    await runner.prove()

    await api.close();
  }
}

testWithRealFile().catch(console.error);
