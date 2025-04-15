export interface DataProvider {
  getSize(): Promise<number>;
}
