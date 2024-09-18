import net from 'net';

/**
 * Get a random port that is free to use.
 * Returns undefined if it fails to get a port.
 *
 * @attribution: adapted from https://stackoverflow.com/a/71178451
 *
 * @returns a random port that is free to use.
 */
export function getRandomPort(): Promise<number | undefined> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object' && 'port' in address) {
        const port = address.port;
        server.close(() => {
          resolve(port);
        });
      } else {
        server.close(() => {
          resolve(undefined);
        });
      }
    });
    server.on('error', () => {
      resolve(undefined);
    });
  });
}
