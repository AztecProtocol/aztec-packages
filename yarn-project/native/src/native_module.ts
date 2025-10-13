import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { MessageReceiver } from './msgpack_channel.js';

interface NativeClassCtor {
  new (...args: unknown[]): MessageReceiver;
}

function loadNativeModule(): Record<string, NativeClassCtor> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Map Node.js platform/arch to build directory names
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  const platform = process.platform === 'darwin' ? 'macos' : process.platform;
  const variant = `${arch}-${platform}`;

  const modulePath = join(__dirname, '..', 'build', variant, 'nodejs_module.node');

  try {
    const require = createRequire(import.meta.url);
    return require(modulePath);
  } catch (error) {
    throw new Error(
      `Failed to load native module for ${variant} from ${modulePath}. ` +
        `Supported: amd64-linux, arm64-linux, amd64-macos, arm64-macos. ` +
        `Error: ${error}`,
    );
  }
}

const nativeModule: Record<string, NativeClassCtor> = loadNativeModule();

export const NativeWorldState: NativeClassCtor = nativeModule.WorldState;
export const NativeLMDBStore: NativeClassCtor = nativeModule.LMDBStore;
