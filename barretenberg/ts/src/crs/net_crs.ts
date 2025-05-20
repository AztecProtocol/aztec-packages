import { retry, makeBackoff } from '../retry/index.js';
/**
 * Downloader for CRS from the web or local.
 */
export class NetCrs {
  private data!: Uint8Array;
  private g2Data!: Uint8Array;

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
    await this.downloadG2Data();
  }

  /**
   * Opens up a ReadableStream to the points data
   */
  async streamG1Data(): Promise<ReadableStream<Uint8Array>> {
    const response = await this.fetchG1Data();
    return response.body!;
  }

  /**
   * Opens up a ReadableStream to the points data
   */
  async streamG2Data(): Promise<ReadableStream<Uint8Array>> {
    const response = await this.fetchG2Data();
    return response.body!;
  }

  async downloadG1Data() {
    const response = await this.fetchG1Data();
    return (this.data = new Uint8Array(await response.arrayBuffer()));
  }

  /**
   * Download the G2 points data.
   */
  async downloadG2Data() {
    const response2 = await this.fetchG2Data();
    return (this.g2Data = new Uint8Array(await response2.arrayBuffer()));
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    return this.data;
  }

  /**
   * G2 points data for verification key.
   * @returns The points data.
   */
  getG2Data(): Uint8Array {
    return this.g2Data;
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
        fetch('https://crs.aztec.network/g1.dat', {
          headers: {
            Range: `bytes=0-${g1End}`,
          },
          cache: 'force-cache',
        }),
      makeBackoff([5, 5, 5]),
    );
  }

  /**
   * Fetches the appropriate range of points from a remote source
   */
  private async fetchG2Data(): Promise<Response> {
    return await retry(
      () =>
        fetch('https://crs.aztec.network/g2.dat', {
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
