import type { IpcClientAsync } from '@aztec-foundation/ipc-runtime';

import { Barretenberg } from './index.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X)';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

describe('getDefaultSrsSize', () => {
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  afterEach(() => realNavigator && Object.defineProperty(globalThis, 'navigator', realNavigator));

  it.each([
    ['an iPhone', IPHONE, 5, 2 ** 18],
    ['an iPad', IPAD, 5, 2 ** 18],
    ['a Mac user agent with touch points', MAC, 5, 2 ** 18],
    ['a Mac', MAC, 0, 2 ** 19],
  ])('gives %s its SRS size', (_device, userAgent, maxTouchPoints, size) => {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent, maxTouchPoints }, configurable: true });
    expect(new Barretenberg({} as IpcClientAsync, {}).getDefaultSrsSize()).toBe(size);
  });
});
