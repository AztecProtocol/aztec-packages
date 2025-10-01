import { retry, makeBackoff } from '../retry/index.js';
/**
 * Downloader for CRS from the web or local.
 */
export class NetCrs {
  private data!: Uint8Array;

  constructor(
    /**
     * The number of circuit gates.
     */
    public readonly numPoints: number,
  ) {}

  /**
   * Download the data.
   */
  async init() {
    await this.downloadG1Data();
  }

  /**
   * Opens up a ReadableStream to the points data
   */
  async streamG1Data(): Promise<ReadableStream<Uint8Array>> {
    const response = await this.fetchG1Data();
    return response.body!;
  }

  async downloadG1Data() {
    const response = await this.fetchG1Data();
    return (this.data = new Uint8Array(await response.arrayBuffer()));
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    return this.data;
  }

  /**
   * Fetches the appropriate range of points from a remote source
   */
  private async fetchG1Data(): Promise<Response> {
    // Skip the download if numPoints is 0 (would download the entire file due to bad range header otherwise)
    if (this.numPoints === 0) {
      return new Response(new Uint8Array([]));
    }

    const g1End = this.numPoints * 64 - 1;
    return await retry(
      () =>
        fetch('http://crs.aztec.network/g1.dat', {
          headers: {
            Range: `bytes=0-${g1End}`,
          },
          cache: 'force-cache',
        }),
      makeBackoff([5, 5, 5]),
    );
  }
}

/**
 * Downloader for CRS from the web or local.
 */
export class NetGrumpkinCrs {
  private data!: Uint8Array;

  constructor(
    /**
     * The number of circuit gates.
     */
    public readonly numPoints: number,
  ) {}

  /**
   * Download the data.
   */
  async init() {
    await this.downloadG1Data();
  }

  async downloadG1Data() {
    const response = await this.fetchG1Data();
    return (this.data = new Uint8Array(await response.arrayBuffer()));
  }

  /**
   * Opens up a ReadableStream to the points data
   */
  async streamG1Data(): Promise<ReadableStream<Uint8Array>> {
    const response = await this.fetchG1Data();
    return response.body!;
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    return this.data;
  }

  /**
   * Fetches the appropriate range of points from a remote source
   */
  private async fetchG1Data(): Promise<Response> {
    // Skip the download if numPoints is 0 (would download the entire file due to bad range header otherwise)
    if (this.numPoints === 0) {
      return new Response(new Uint8Array([]));
    }

    const g1End = this.numPoints * 64 - 1;

    return await fetch('https://crs.aztec.network/grumpkin_g1.dat', {
      headers: {
        Range: `bytes=0-${g1End}`,
      },
      cache: 'force-cache',
    });
  }
}
