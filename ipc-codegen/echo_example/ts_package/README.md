# @aztec/echo-ipc

Generated TypeScript IPC package for the Echo service.

```ts
import { EchoService } from '@aztec/echo-ipc';

const service = await EchoService.spawn({ transport: 'uds' });
try {
  const response = await service.bytes({ data: new Uint8Array([1, 2, 3]) });
} finally {
  await service.destroy();
}
```

The package resolves `echo_server` from `ECHO_SERVER_PATH`,
an installed arch package, or `build/<platform>/echo_server`.

## Build

```sh
npm install --omit=optional
npm run build
```

To prepare per-architecture binary packages from local `build/<platform>`
directories:

```sh
npm run prepare_arch_packages
```
