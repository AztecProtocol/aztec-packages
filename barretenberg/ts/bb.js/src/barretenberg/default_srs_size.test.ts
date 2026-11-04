import type { IpcClientAsync } from '@aztec-foundation/ipc-runtime';

import { Barretenberg } from './index.js';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const IOS_SRS_SIZE = 2 ** 18;
const DESKTOP_SRS_SIZE = 2 ** 19;

describe('getDefaultSrsSize', () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  it.each([
    ['an iPhone', IPHONE, 5, IOS_SRS_SIZE],
    ['an iPad', IPAD, 5, IOS_SRS_SIZE],
    ['an iPad or a desktop-mode iPhone (Mac user agent with touch)', MAC, 5, IOS_SRS_SIZE],
    ['a Mac', MAC, 0, DESKTOP_SRS_SIZE],
  ])('gives %s an SRS of the right size', (_device, userAgent, maxTouchPoints, size) => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent, maxTouchPoints },
      configurable: true,
      writable: true,
    });
    expect(new Barretenberg({} as IpcClientAsync, {}).getDefaultSrsSize()).toBe(size);
  });
});
