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

  async downloadG1Data() {
    // Skip the download if numPoints is 0 (would download the entire file due to bad range header otherwise)
    if (this.numPoints === 0) {
      return (this.data = new Uint8Array([]));
    }

    const g1End = this.numPoints * 64 - 1;

    const response = await retry(
      () =>
        fetch('https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/g1.dat', {
          headers: {
            Range: `bytes=0-${g1End}`,
          },
          cache: 'force-cache',
        }),
      makeBackoff([5, 5, 5]),
    );

    return (this.data = new Uint8Array(await response.arrayBuffer()));
  }

  /**
   * Download the G2 points data.
   */
  async downloadG2Data() {
    const response2 = await retry(
      () =>
        fetch('https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/g2.dat', {
          cache: 'force-cache',
        }),
      makeBackoff([5, 5, 5]),
    );

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
    // Skip the download if numPoints is 0 (would download the entire file due to bad range header otherwise)
    if (this.numPoints === 0) {
      return (this.data = new Uint8Array([]));
    }

    const g1Start = 28;
    const g1End = g1Start + (this.numPoints * 64 - 1);

    const response = await fetch('https://aztec-ignition.s3.amazonaws.com/TEST%20GRUMPKIN/monomial/transcript00.dat', {
      headers: {
        Range: `bytes=${g1Start}-${g1End}`,
      },
      cache: 'force-cache',
    });

    return (this.data = new Uint8Array(await response.arrayBuffer()));
  }

  /**
   * G1 points data for prover key.
   * @returns The points data.
   */
  getG1Data(): Uint8Array {
    return this.data;
  }
}
