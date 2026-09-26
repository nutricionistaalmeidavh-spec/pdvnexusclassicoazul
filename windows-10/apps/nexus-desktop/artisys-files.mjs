// Vendored from nutricionistaalmeidavh-spec/utilidades/modules/artisys-files/src/index.mjs
// Core local/self-hosted: no paid service or runtime network dependency.
import { constants, watch } from 'node:fs';
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile as fsReadFile,
  readdir,
  realpath,
  rename as fsRename,
  rm,
  stat,
  writeFile as fsWriteFile,
} from 'node:fs/promises';
import path from 'node:path';

function workspaceError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function normalizeRelative(relativePath = '') {
  if (typeof relativePath !== 'string') {
    throw workspaceError('INVALID_PATH', 'Workspace path must be a string');
  }
  if (path.isAbsolute(relativePath)) {
    throw workspaceError('ABSOLUTE_PATH', 'Workspace paths must be relative', { path: relativePath });
  }
  const normalized = path.normalize(relativePath || '.');
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw workspaceError('PATH_TRAVERSAL', 'Workspace path escapes root', { path: relativePath });
  }
  return normalized === '.' ? '' : normalized;
}

export function resolveInsideRoot(root, relativePath = '') {
  const absoluteRoot = path.resolve(root);
  const normalized = normalizeRelative(relativePath);
  const resolved = path.resolve(absoluteRoot, normalized);
  const relative = path.relative(absoluteRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw workspaceError('PATH_TRAVERSAL', 'Workspace path escapes root', { path: relativePath });
  }
  return resolved;
}

export function toWorkspacePath(root, absolutePath) {
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absolutePath);
  const relative = path.relative(absoluteRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw workspaceError('OUTSIDE_WORKSPACE', 'Path is outside workspace root', { path: absolutePath });
  }
  return relative.split(path.sep).join('/');
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertNoSymlinkTraversal(root, relativePath, { includeLeaf = true } = {}) {
  const normalized = normalizeRelative(relativePath);
  if (!normalized) return;
  const segments = normalized.split(path.sep).filter(Boolean);
  const limit = includeLeaf ? segments.length : Math.max(segments.length - 1, 0);
  let current = path.resolve(root);
  for (let index = 0; index < limit; index += 1) {
    current = path.join(current, segments[index]);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw workspaceError('SYMLINK_NOT_ALLOWED', 'Symbolic links are not followed inside a workspace', { path: toWorkspacePath(root, current) });
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function entryFromPath(root, absolutePath) {
  const info = await lstat(absolutePath);
  const relative = toWorkspacePath(root, absolutePath);
  const name = relative ? path.basename(absolutePath) : path.basename(root);
  if (info.isSymbolicLink()) return { name, path: relative, type: 'symlink', modifiedAt: info.mtime.toISOString() };
  if (info.isDirectory()) return { name, path: relative, type: 'directory', modifiedAt: info.mtime.toISOString() };
  return { name, path: relative, type: 'file', size: info.size, extension: path.extname(name).replace(/^\./, '').toLowerCase() || undefined, modifiedAt: info.mtime.toISOString() };
}

async function buildTree(root, absoluteDirectory) {
  const base = await entryFromPath(root, absoluteDirectory);
  if (base.type !== 'directory') throw workspaceError('NOT_DIRECTORY', 'Tree root must be a directory', { path: base.path });
  const items = await readdir(absoluteDirectory, { withFileTypes: true });
  items.sort((a, b) => a.name.localeCompare(b.name));
  const children = [];
  for (const item of items) {
    const absolute = path.join(absoluteDirectory, item.name);
    if (item.isDirectory() && !item.isSymbolicLink()) children.push(await buildTree(root, absolute));
    else children.push(await entryFromPath(root, absolute));
  }
  return { ...base, children };
}

function validateSimpleName(name) {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw workspaceError('INVALID_NAME', 'Name must be a single file or directory name', { name });
  }
}

async function ensureDestinationAvailable(destination, root) {
  if (await exists(destination)) throw workspaceError('DESTINATION_EXISTS', 'Destination already exists', { path: toWorkspacePath(root, destination) });
}

function assertNotDescendantMove(source, destination) {
  const relative = path.relative(source, destination);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw workspaceError('DESTINATION_INSIDE_SOURCE', 'Destination cannot be the source or one of its descendants');
  }
}

export async function createWorkspace(root) {
  if (!root || typeof root !== 'string') throw workspaceError('INVALID_ROOT', 'A workspace root directory is required');
  await mkdir(path.resolve(root), { recursive: true });
  const workspaceRoot = await realpath(path.resolve(root));
  const api = {
    root: workspaceRoot,
    async listTree(relativePath = '') {
      await assertNoSymlinkTraversal(workspaceRoot, relativePath);
      return buildTree(workspaceRoot, resolveInsideRoot(workspaceRoot, relativePath));
    },
    async createDirectory(relativePath) {
      await assertNoSymlinkTraversal(workspaceRoot, relativePath, { includeLeaf: false });
      await mkdir(resolveInsideRoot(workspaceRoot, relativePath), { recursive: true });
    },
    async writeFile(relativePath, data) {
      await assertNoSymlinkTraversal(workspaceRoot, relativePath, { includeLeaf: false });
      const destination = resolveInsideRoot(workspaceRoot, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      if (await exists(destination)) {
        const info = await lstat(destination);
        if (info.isSymbolicLink()) throw workspaceError('SYMLINK_NOT_ALLOWED', 'Refusing to write through a symbolic link', { path: relativePath });
      }
      await fsWriteFile(destination, data);
    },
    async readFile(relativePath, options) {
      await assertNoSymlinkTraversal(workspaceRoot, relativePath);
      const source = resolveInsideRoot(workspaceRoot, relativePath);
      const info = await lstat(source);
      if (!info.isFile()) throw workspaceError('NOT_FILE', 'Workspace path must be a file', { path: relativePath });
      return fsReadFile(source, options);
    },
    async rename(relativePath, newName) {
      validateSimpleName(newName);
      await assertNoSymlinkTraversal(workspaceRoot, relativePath);
      const source = resolveInsideRoot(workspaceRoot, relativePath);
      const destination = path.join(path.dirname(source), newName);
      await ensureDestinationAvailable(destination, workspaceRoot);
      await fsRename(source, destination);
      return toWorkspacePath(workspaceRoot, destination);
    },
    async move(sourcePath, destinationPath) {
      await assertNoSymlinkTraversal(workspaceRoot, sourcePath);
      await assertNoSymlinkTraversal(workspaceRoot, destinationPath, { includeLeaf: false });
      const source = resolveInsideRoot(workspaceRoot, sourcePath);
      const destination = resolveInsideRoot(workspaceRoot, destinationPath);
      assertNotDescendantMove(source, destination);
      await ensureDestinationAvailable(destination, workspaceRoot);
      await mkdir(path.dirname(destination), { recursive: true });
      await fsRename(source, destination);
    },
    async copy(sourcePath, destinationPath) {
      await assertNoSymlinkTraversal(workspaceRoot, sourcePath);
      await assertNoSymlinkTraversal(workspaceRoot, destinationPath, { includeLeaf: false });
      const source = resolveInsideRoot(workspaceRoot, sourcePath);
      const destination = resolveInsideRoot(workspaceRoot, destinationPath);
      assertNotDescendantMove(source, destination);
      await ensureDestinationAvailable(destination, workspaceRoot);
      const info = await stat(source);
      await mkdir(path.dirname(destination), { recursive: true });
      if (info.isDirectory()) await cp(source, destination, { recursive: true, errorOnExist: true, force: false, dereference: false });
      else await copyFile(source, destination, constants.COPYFILE_EXCL);
    },
    async remove(relativePath) {
      if (!relativePath) throw workspaceError('ROOT_DELETE_BLOCKED', 'Workspace root cannot be removed');
      await assertNoSymlinkTraversal(workspaceRoot, relativePath, { includeLeaf: false });
      await rm(resolveInsideRoot(workspaceRoot, relativePath), { recursive: true, force: false });
    },
  };
  return Object.freeze(api);
}

export async function applyDrop(workspace, request) {
  if (!workspace || typeof workspace.move !== 'function' || typeof workspace.copy !== 'function') throw workspaceError('INVALID_WORKSPACE', 'A workspace instance is required');
  if (!request?.sourcePath || typeof request.sourcePath !== 'string') throw workspaceError('INVALID_DROP_SOURCE', 'sourcePath is required for drag-and-drop');
  const source = normalizeRelative(request.sourcePath).split(path.sep).join('/');
  const targetDirectory = normalizeRelative(request?.targetDirectory ?? '').split(path.sep).join('/');
  const destination = path.posix.join(targetDirectory, path.posix.basename(source));
  if (source === destination) return destination;
  if (request?.mode === 'copy') await workspace.copy(source, destination);
  else if (!request?.mode || request.mode === 'move') await workspace.move(source, destination);
  else throw workspaceError('INVALID_DROP_MODE', 'Drop mode must be move or copy', { mode: request.mode });
  return destination;
}

function flattenTree(tree, output = []) {
  for (const child of tree.children ?? []) {
    output.push(child);
    if (child.type === 'directory') flattenTree(child, output);
  }
  return output;
}

export class WorkspaceIndex {
  #entries = [];
  rebuild(tree) {
    this.#entries = flattenTree(tree).map((entry) => ({ entry, searchable: `${entry.name} ${entry.path} ${entry.extension ?? ''} ${entry.type}`.toLocaleLowerCase() }));
    return this;
  }
  search(query = '') {
    const terms = String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return this.#entries.map(({ entry }) => ({ ...entry }));
    return this.#entries.filter(({ searchable }) => terms.every((term) => searchable.includes(term))).map(({ entry }) => ({ ...entry }));
  }
  get size() { return this.#entries.length; }
}

export function normalizeWatchEvent(root, eventType, filename) {
  if (!filename) return null;
  const relative = filename.toString();
  const absolute = resolveInsideRoot(root, relative);
  return { kind: eventType === 'rename' ? 'renamed' : 'changed', path: toWorkspacePath(root, absolute) };
}

export function watchWorkspace(root, onChange, options = {}) {
  if (typeof onChange !== 'function') throw workspaceError('INVALID_WATCH_HANDLER', 'onChange must be a function');
  const absoluteRoot = path.resolve(root);
  return watch(absoluteRoot, { recursive: options.recursive ?? true }, (eventType, filename) => {
    const change = normalizeWatchEvent(absoluteRoot, eventType, filename);
    if (change) onChange(change);
  });
}

export function createStorageBridge(storage, namespace = 'files') {
  if (!storage || typeof storage.put !== 'function' || typeof storage.get !== 'function') throw workspaceError('INVALID_STORAGE', 'Storage adapter must provide put and get');
  const prefix = namespace ? `${String(namespace).replace(/\/+$/g, '')}/` : '';
  const key = (workspacePath) => `${prefix}${normalizeRelative(workspacePath).split(path.sep).join('/')}`;
  return Object.freeze({
    async put(workspacePath, data, metadata) { return storage.put(key(workspacePath), data, metadata === undefined ? {} : { metadata }); },
    async get(workspacePath) { return storage.get(key(workspacePath)); },
    async delete(workspacePath) {
      if (typeof storage.delete !== 'function') throw workspaceError('STORAGE_DELETE_UNSUPPORTED', 'Storage adapter does not provide delete');
      return storage.delete(key(workspacePath));
    },
    async list(prefixPath = '') {
      if (typeof storage.list !== 'function') throw workspaceError('STORAGE_LIST_UNSUPPORTED', 'Storage adapter does not provide list');
      return storage.list(key(prefixPath));
    },
  });
}

export const version = '0.1.0';
