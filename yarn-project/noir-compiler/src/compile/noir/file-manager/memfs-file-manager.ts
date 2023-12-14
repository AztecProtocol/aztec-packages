import { IFs, fs } from 'memfs';
import { IDirent } from 'memfs/lib/node/types/misc.js';

import { FileManager } from './file-manager.js';

/**
 * Creates a new FileManager instance based on a MemFS instance
 * @param memFS - the memfs backing instance
 * @param dataDir - where to store files
 */
export function createMemFSFileManager(memFS: IFs = fs, dataDir = '/'): FileManager {
  const readdirSyncRecursive = (dir: string): string[] => {
    const contents = memFS.readdirSync(dir);
    let files: string[] = [];
    contents.forEach(handle => {
      if ((handle as IDirent).isFile()) {
        files.push(handle.toString());
      } else {
        files = files.concat(readdirSyncRecursive(handle.toString()));
      }
    });
    return files;
  };
  return new FileManager(
    {
      existsSync: memFS.existsSync.bind(memFS),
      mkdirSync: memFS.mkdirSync.bind(memFS),
      writeFileSync: memFS.writeFileSync.bind(memFS),
      renameSync: memFS.renameSync.bind(memFS),
      readFileSync: memFS.readFileSync.bind(memFS),
      readdirSync: (dir: string, options?: { recursive: boolean }) => {
        if (options?.recursive) {
          return readdirSyncRecursive(dir);
        }
        return memFS.readdirSync(dir).map(handles => handles.toString());
      },
    },
    dataDir,
  );
}
