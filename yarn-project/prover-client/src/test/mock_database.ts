// Mock ProofStore for faster benchmarks
export class MockProofStore {
  private mockCounter = 0;

  saveProofInput(_jobId: any, _type: any, _inputs: any): Promise<string> {
    // Return a mock URI without actually saving anything
    return Promise.resolve(`mock://proof-input-${++this.mockCounter}` as any);
  }

  getProofInput(_uri: string): Promise<any> {
    // Return minimal mock data
    return Promise.resolve({});
  }

  saveProofOutput(_jobId: any, _type: any, _proof: any, _vk: any): Promise<string> {
    return Promise.resolve(`mock://proof-output-${++this.mockCounter}`);
  }

  getProofOutput(_uri: string): Promise<any> {
    return Promise.resolve({ proof: [], vk: {} });
  }
}
