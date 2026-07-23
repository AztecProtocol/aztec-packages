import { normalizePoolDirectory } from './pool_lock.js';

// The constants below mirror the opaque-file header format of the pinned opfs-sahpool VFS
// (`yarn-project/sqlite3mc-wasm/vendor/jswasm/sqlite3.mjs`, class `OpfsSAHPool`). The pool names its files randomly
// under `.opaque/` and prepends a header that maps each one back to its logical SQLite path:
//
//   bytes [0, 512)    logical path, NUL-terminated UTF-8 (HEADER_MAX_PATH_SIZE)
//   bytes [512, 516)  SQLite open-flags of the file, big-endian uint32 (HEADER_FLAGS_SIZE)
//   bytes [516, 524)  digest over the preceding 516 bytes, two uint32 words (HEADER_DIGEST_SIZE)
//
// Database content starts at byte 4096 (the pool's SECTOR_SIZE). We re-read the header ourselves rather than asking
// the VFS because the upstream pool "repairs" anything it cannot validate by disassociating the file — destroying
// exactly the evidence this module exists to quarantine. The browser regression test writes a real pool through the
// pinned VFS before duplicating an opaque file, so a vendor upgrade that changes the layout breaks detection loudly
// rather than silently.
const OPAQUE_DIRECTORY = '.opaque';
const HEADER_MAX_PATH_SIZE = 512;
const HEADER_FLAGS_SIZE = 4;
const HEADER_DIGEST_SIZE = 8;
const HEADER_CORPUS_SIZE = HEADER_MAX_PATH_SIZE + HEADER_FLAGS_SIZE;
const HEADER_SIZE = HEADER_CORPUS_SIZE + HEADER_DIGEST_SIZE;

// Standard SQLite open-flag bit values (sqlite3.h). Restated as literals because the header stores them numerically
// and this module runs on the main thread, without the sqlite3 WASM bundle that defines `capi.SQLITE_OPEN_*`.
const SQLITE_OPEN_DELETEONCLOSE = 0x00000008;
const SQLITE_OPEN_MEMORY = 0x00000080;
const SQLITE_OPEN_MAIN_DB = 0x00000100;
const SQLITE_OPEN_MAIN_JOURNAL = 0x00000800;
const SQLITE_OPEN_SUPER_JOURNAL = 0x00004000;
const SQLITE_OPEN_WAL = 0x00080000;

// A live association must name one of the file types the pool persists; transient types (temp DBs, statement
// journals) never survive in a valid header.
const PERSISTENT_FILE_TYPES =
  SQLITE_OPEN_MAIN_DB | SQLITE_OPEN_MAIN_JOURNAL | SQLITE_OPEN_SUPER_JOURNAL | SQLITE_OPEN_WAL;

// The upstream VFS repurposes SQLITE_OPEN_MEMORY — meaningless for a file that exists on disk — as a header version
// marker: headers written with it set carry a real digest, while legacy headers leave it unset and store all-zero
// digest words.
const FLAG_COMPUTE_DIGEST_V2 = SQLITE_OPEN_MEMORY;

export const OPFS_QUARANTINE_ROOT_DIRECTORY = '.aztec-sqlite-quarantine';

export interface DuplicatePoolAssociation {
  logicalPath: string;
  opaqueFileNames: string[];
}

export interface PoolQuarantineMetadata {
  formatVersion: 1;
  originalPoolDirectory: string;
  quarantinedAt: string;
  duplicateAssociations: DuplicatePoolAssociation[];
}

export interface PoolQuarantineResult extends PoolQuarantineMetadata {
  quarantineDirectory: string;
}

/**
 * Detects duplicate SAH logical-file associations and, if found, copies the complete pool into quarantine before
 * removing the original. The caller must hold the pool's exclusive Web Lock for the whole operation.
 */
export async function quarantineDuplicatePool(poolDirectory: string): Promise<PoolQuarantineResult | undefined> {
  poolDirectory = normalizePoolDirectory(poolDirectory);
  const root = await navigator.storage.getDirectory();
  const source = await getDirectory(root, poolDirectory);
  if (!source) {
    return undefined;
  }
  const opaque = await getChildDirectory(source, OPAQUE_DIRECTORY);
  if (!opaque) {
    return undefined;
  }

  const duplicateAssociations = await findDuplicateAssociations(opaque);
  if (duplicateAssociations.length === 0) {
    return undefined;
  }

  const quarantineRoot = await root.getDirectoryHandle(OPFS_QUARANTINE_ROOT_DIRECTORY, { create: true });
  const quarantineName = createQuarantineName();
  const destination = await quarantineRoot.getDirectoryHandle(quarantineName, { create: true });
  const metadata: PoolQuarantineMetadata = {
    formatVersion: 1,
    originalPoolDirectory: poolDirectory,
    quarantinedAt: new Date().toISOString(),
    duplicateAssociations,
  };

  let quarantineComplete = false;
  try {
    await copyDirectory(source, destination);
    await verifyDirectoryCopy(source, destination);
    await writeJson(destination, 'quarantine.json', metadata);
    quarantineComplete = true;
    await removeDirectory(root, poolDirectory);
  } catch (err) {
    if (!quarantineComplete) {
      await quarantineRoot.removeEntry(quarantineName, { recursive: true }).catch(() => {});
    }
    throw err;
  }

  return {
    ...metadata,
    quarantineDirectory: `${OPFS_QUARANTINE_ROOT_DIRECTORY}/${quarantineName}`,
  };
}

async function findDuplicateAssociations(opaque: FileSystemDirectoryHandle): Promise<DuplicatePoolAssociation[]> {
  const associations = new Map<string, string[]>();
  for await (const [opaqueName, handle] of opaque.entries()) {
    if (handle.kind !== 'file') {
      continue;
    }
    const logicalPath = await readAssociatedPath(handle as FileSystemFileHandle);
    if (logicalPath) {
      const names = associations.get(logicalPath) ?? [];
      names.push(opaqueName);
      associations.set(logicalPath, names);
    }
  }
  return [...associations.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([logicalPath, opaqueFileNames]) => ({ logicalPath, opaqueFileNames: opaqueFileNames.sort() }))
    .sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
}

/**
 * Returns the logical SQLite path an opaque SAH file is associated with, or undefined if the file is not a live,
 * valid association. Applies the same checks as the vendored pool's `getAssociatedPath`: a non-empty NUL-terminated
 * path, open-flags naming a persistent file type without DELETEONCLOSE, and a matching header digest. Files failing
 * any check are the pool's free-list or garbage entries — the VFS itself would disassociate them on open — so they
 * cannot participate in a duplicate mapping.
 */
async function readAssociatedPath(handle: FileSystemFileHandle): Promise<string | undefined> {
  const file = await handle.getFile();
  if (file.size < HEADER_SIZE) {
    return undefined;
  }
  const header = new Uint8Array(await file.slice(0, HEADER_SIZE).arrayBuffer());
  const pathEnd = header.subarray(0, HEADER_MAX_PATH_SIZE).indexOf(0);
  if (pathEnd <= 0) {
    return undefined;
  }

  const dataView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const flags = dataView.getUint32(HEADER_MAX_PATH_SIZE);
  if ((flags & SQLITE_OPEN_DELETEONCLOSE) !== 0 || (flags & PERSISTENT_FILE_TYPES) === 0) {
    return undefined;
  }
  if (!hasValidDigest(header, flags)) {
    return undefined;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(header.subarray(0, pathEnd));
  } catch {
    return undefined;
  }
}

/**
 * Byte-for-byte port of the vendored pool's `computeDigest`, checked against the digest words stored in the header.
 */
function hasValidDigest(header: Uint8Array, flags: number): boolean {
  let expected0 = 0;
  let expected1 = 0;
  if ((flags & FLAG_COMPUTE_DIGEST_V2) !== 0) {
    // These seeds (0xdeadbeef, 0x41c6ce57) and odd multipliers (2654435761, 104729) are the upstream author's choices
    // (a cyrb53-hash variant) and carry no meaning here beyond having to match the vendored implementation bit for
    // bit.
    expected0 = 0xdeadbeef;
    expected1 = 0x41c6ce57;
    for (const value of header.subarray(0, HEADER_CORPUS_SIZE)) {
      expected0 = Math.imul(expected0 ^ value, 2654435761);
      expected1 = Math.imul(expected1 ^ value, 104729);
    }
    expected0 >>>= 0;
    expected1 >>>= 0;
  }
  const dataView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  return (
    dataView.getUint32(HEADER_CORPUS_SIZE, true) === expected0 &&
    dataView.getUint32(HEADER_CORPUS_SIZE + 4, true) === expected1
  );
}

async function getDirectory(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle | undefined> {
  let current = root;
  try {
    for (const segment of path.split('/')) {
      current = await current.getDirectoryHandle(segment);
    }
    return current;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      return undefined;
    }
    throw err;
  }
}

async function getChildDirectory(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return await parent.getDirectoryHandle(name);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      return undefined;
    }
    throw err;
  }
}

async function removeDirectory(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const segments = path.split('/');
  const name = segments.pop()!;
  let parent = root;
  for (const segment of segments) {
    parent = await parent.getDirectoryHandle(segment);
  }
  await parent.removeEntry(name, { recursive: true });
}

async function copyDirectory(source: FileSystemDirectoryHandle, destination: FileSystemDirectoryHandle): Promise<void> {
  for await (const [name, handle] of source.entries()) {
    if (handle.kind === 'directory') {
      const childDestination = await destination.getDirectoryHandle(name, { create: true });
      await copyDirectory(handle as FileSystemDirectoryHandle, childDestination);
      continue;
    }

    const sourceFile = await (handle as FileSystemFileHandle).getFile();
    const destinationHandle = await destination.getFileHandle(name, { create: true });
    const writable = await destinationHandle.createWritable();
    try {
      await writable.write(sourceFile);
      await writable.close();
    } catch (err) {
      await writable.abort().catch(() => {});
      throw err;
    }
  }
}

async function verifyDirectoryCopy(
  source: FileSystemDirectoryHandle,
  destination: FileSystemDirectoryHandle,
): Promise<void> {
  const sourceEntries = await getSortedEntries(source);
  const destinationEntries = await getSortedEntries(destination);
  if (
    sourceEntries.length !== destinationEntries.length ||
    sourceEntries.some(([name, handle], index) => {
      const destinationEntry = destinationEntries[index];
      return name !== destinationEntry[0] || handle.kind !== destinationEntry[1].kind;
    })
  ) {
    throw new Error('Failed to verify quarantined OPFS directory structure');
  }

  for (let i = 0; i < sourceEntries.length; i++) {
    const [, sourceHandle] = sourceEntries[i];
    const [, destinationHandle] = destinationEntries[i];
    if (sourceHandle.kind === 'directory') {
      await verifyDirectoryCopy(
        sourceHandle as FileSystemDirectoryHandle,
        destinationHandle as FileSystemDirectoryHandle,
      );
    } else {
      await verifyFilesEqual(sourceHandle as FileSystemFileHandle, destinationHandle as FileSystemFileHandle);
    }
  }
}

async function getSortedEntries(directory: FileSystemDirectoryHandle): Promise<[string, FileSystemHandle][]> {
  const entries: [string, FileSystemHandle][] = [];
  for await (const entry of directory.entries()) {
    entries.push(entry);
  }
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

async function verifyFilesEqual(sourceHandle: FileSystemFileHandle, destinationHandle: FileSystemFileHandle) {
  const source = await sourceHandle.getFile();
  const destination = await destinationHandle.getFile();
  if (source.size !== destination.size) {
    throw new Error(`Failed to verify quarantined OPFS file "${source.name}"`);
  }

  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < source.size; offset += chunkSize) {
    const [sourceChunk, destinationChunk] = await Promise.all([
      source.slice(offset, offset + chunkSize).arrayBuffer(),
      destination.slice(offset, offset + chunkSize).arrayBuffer(),
    ]);
    const sourceBytes = new Uint8Array(sourceChunk);
    const destinationBytes = new Uint8Array(destinationChunk);
    if (sourceBytes.some((value, index) => value !== destinationBytes[index])) {
      throw new Error(`Failed to verify quarantined OPFS file "${source.name}"`);
    }
  }
}

async function writeJson(directory: FileSystemDirectoryHandle, name: string, value: unknown): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(value, undefined, 2));
    await writable.close();
  } catch (err) {
    await writable.abort().catch(() => {});
    throw err;
  }
}

function createQuarantineName(): string {
  const random = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return `${Date.now()}-${[...random].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
