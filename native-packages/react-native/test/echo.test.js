// ipc-codegen's echo example under Hermes, through ipc-runtime's JSI binding: its Relay calls out to
// "peer" before it answers, and "peer" is bound back to the same backend, so every hop is another
// call into the one asynchronous instance while the hops before it wait on their answers. The
// library is the Rust example's (ipc-codegen/echo_example/rust), loaded by file name.
import '../js/index.js';

import { createJsiFfiBackend } from '@aztec-foundation/ipc-runtime/react-native';

import { equal, rejects, run, test } from './harness.js';

const ascii = text => Array.from(text, c => c.charCodeAt(0));
const str = text => [0xa0 + text.length, ...ascii(text)];

// [["EchoRelay", {"data": <bin>, "hops": <fixint>}]]
const relay = (data, hops) =>
  Uint8Array.from([0x91, 0x92, ...str('EchoRelay'), 0x82, ...str('data'), 0xc4, data.length, ...data, ...str('hops'), hops]);

// ["EchoRelayResponse", {"data": <bin>}] -> the data
function relayed(response) {
  const header = [0x92, ...str('EchoRelayResponse'), 0x81, ...str('data'), 0xc4];
  equal(Array.from(response.subarray(0, header.length)), header, 'a Relay response');
  return Array.from(response.subarray(header.length + 1, header.length + 1 + response[header.length]));
}

const library = 'libecho_wire_compat.so';

test('relays nest on one asynchronous instance over JSI', async () => {
  let waiting = 0;
  let mostWaiting = 0;
  const backend = createJsiFfiBackend({
    ffiName: 'echo',
    library,
    hostCall: {
      peer: async request => {
        mostWaiting = Math.max(mostWaiting, ++waiting);
        try {
          return await backend.call(request);
        } finally {
          waiting--;
        }
      },
    },
  });
  equal(relayed(await backend.call(relay([9], 5))), [9, 5, 4, 3, 2, 1], 'five hops');
  equal(mostWaiting, 5, 'every hop waits on the next, on the one instance');
  const [a, b] = await Promise.all([backend.call(relay([1], 3)), backend.call(relay([2], 2))]);
  equal([relayed(a), relayed(b)], [[1, 3, 2, 1], [2, 2, 1]], 'two relays at once');
  await backend.destroy();
});

test('a relay with no peer fails with the host message', async () => {
  const backend = createJsiFfiBackend({ ffiName: 'echo', library });
  const response = await backend.call(relay([1], 1));
  equal(response[1], 0xb1, 'an EchoErrorResponse');
  const text = String.fromCharCode(...response);
  if (!text.includes('no host-call target "peer"')) throw new Error(`unexpected error: ${text}`);
  await backend.destroy();
  await rejects(() => backend.call(relay([1], 0)), /after destroy/, 'a destroyed backend');
});

run();
