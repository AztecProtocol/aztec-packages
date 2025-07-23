// #!/usr/bin/env node
import { NativeApi } from './generated/native.js';
import { IvcRunner, IvcInputs } from './ivc-inputs.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

function getCurrentDir() {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  } else {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return dirname(fileURLToPath(import.meta.url));
  }
}

// Test reading an actual ivc-inputs.msgpack file if it exists
async function testWithRealFile() {
  const realInputsPath = './ivc-inputs.msgpack';

  console.log('\n=== Testing with real ivc-inputs.msgpack file ===');

  const inputs = IvcInputs.fromFile(realInputsPath);
  console.log('✓ Successfully loaded', inputs.getStepCount(), 'steps');

  // If we have real data, we could test the actual IVC flow
  const __dirname = getCurrentDir();
  const bbPath = join(__dirname, '..', '..', '..', 'cpp', 'build', 'bin', 'bb');
  console.log('Using Barretenberg binary at:', bbPath);
  const api = await NativeApi.new(bbPath);
  const runner = new IvcRunner(api as any);
  console.log("runner created")
  await runner.accumulateFromFile(realInputsPath);
  console.log("accum")
  await runner.prove()
  console.log("prove")

  await api.close();
}

testWithRealFile().catch(console.error);
