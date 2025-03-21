/** Simple file store. */
export interface FileStore {
  /** Saves contents to the given path. Returns an URI that can be used later to `read` the file. */
  save(path: string, data: Buffer): Promise<string>;
  /** Uploads contents from a local file. Returns an URI that can be used later to `read` the file. */
  upload(destPath: string, srcPath: string, opts: { compress: boolean }): Promise<string>;
  /** Reads a file given a path, or an URI as returned by calling `save`. Returns file contents. */
  read(pathOrUrl: string): Promise<Buffer>;
  /** Downloads a file given a path, or an URI as returned by calling `save`. Saves file to local path. */
  download(pathOrUrlStr: string, destPath: string): Promise<void>;
  /** Returns whether a file at the given path or URI exists. */
  exists(pathOrUrl: string): Promise<boolean>;
}
