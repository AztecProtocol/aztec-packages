export class NoBlobBodiesFoundError extends Error {
  constructor(l2BlockNum: number) {
    super(`No blob bodies found for block ${l2BlockNum}`);
  }
}
