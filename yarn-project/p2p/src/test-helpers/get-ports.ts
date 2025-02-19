import getPort from 'get-port';

/**
 * Get a list of ports for a given number of peers
 * @param numberOfPeers - The number of peers to get ports for
 * @returns A list of ports
 */
export const getPorts = (numberOfPeers: number) => Promise.all(Array.from({ length: numberOfPeers }, () => getPort()));
