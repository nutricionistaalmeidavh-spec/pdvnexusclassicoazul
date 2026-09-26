// Vendored from nutricionistaalmeidavh-spec/utilidades@9bca8b29f3a5875433b42d01ceb84e743dabba82/modules/artisys-upload/src/index.mjs
// Core local/self-hosted: no paid service or runtime network dependency.
// Vendored from nutricionistaalmeidavh-spec/utilidades/modules/artisys-upload/src/index.mjs
// Core local/self-hosted: no paid service or runtime network dependency.
function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
  return value;
}

function nonNegativeNumber(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative finite number`);
  return value;
}

function normalizeAccept(accept = []) {
  if (!Array.isArray(accept)) throw new TypeError('accept must be an array');
  const values = accept.map((value) => {
    if (typeof value !== 'string' || value.trim() === '') throw new TypeError('accept entries must be non-empty strings');
    return value.trim().toLowerCase();
  });
  return [...new Set(values)];
}

export function validateUploadPolicy(policy = {}) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new TypeError('policy must be an object');
  return {
    maxFiles: positiveInteger(policy.maxFiles ?? 1, 'maxFiles'),
    maxFileSize: nonNegativeNumber(policy.maxFileSize ?? Number.MAX_SAFE_INTEGER, 'maxFileSize'),
    accept: normalizeAccept(policy.accept ?? []),
  };
}

export function normalizeUploadFile(file) {
  if (!file || typeof file !== 'object') throw new TypeError('file must be an object');
  if (typeof file.name !== 'string' || file.name.trim() === '') throw new TypeError('file name is required');
  const normalized = {
    name: file.name,
    size: nonNegativeNumber(file.size ?? 0, 'file size'),
    type: typeof file.type === 'string' ? file.type.toLowerCase() : '',
    lastModified: file.lastModified == null ? null : nonNegativeNumber(file.lastModified, 'lastModified'),
  };
  return normalized;
}

function typeAllowed(file, accept) {
  if (accept.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return accept.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

export function validateUploadBatch(files, policyInput = {}) {
  if (!Array.isArray(files)) throw new TypeError('files must be an array');
  const policy = validateUploadPolicy(policyInput);
  const accepted = [];
  const rejected = [];

  files.forEach((input, index) => {
    const file = normalizeUploadFile(input);
    const reasons = [];
    if (index >= policy.maxFiles) reasons.push('too-many-files');
    if (file.size > policy.maxFileSize) reasons.push('file-too-large');
    if (!typeAllowed(file, policy.accept)) reasons.push('type-not-allowed');
    if (reasons.length) rejected.push({ ...file, reasons });
    else accepted.push(file);
  });

  return { accepted, rejected, policy };
}

export function createUploadQueue(files, options = {}) {
  if (!Array.isArray(files)) throw new TypeError('files must be an array');
  const idFactory = options.idFactory ?? ((file, index) => globalThis.crypto?.randomUUID?.() ?? `upload-${index + 1}`);
  if (typeof idFactory !== 'function') throw new TypeError('idFactory must be a function');
  return files.map((file, index) => ({
    id: String(idFactory(file, index)),
    ...normalizeUploadFile(file),
    status: 'queued',
    progress: 0,
  }));
}

export function createUppyConfig(policyInput = {}) {
  const policy = validateUploadPolicy(policyInput);
  return {
    restrictions: {
      maxNumberOfFiles: policy.maxFiles,
      maxFileSize: policy.maxFileSize,
      allowedFileTypes: [...policy.accept],
    },
  };
}

export function toDropzoneOptions(policyInput = {}) {
  const policy = validateUploadPolicy(policyInput);
  const accept = Object.fromEntries(policy.accept.map((entry) => [entry, []]));
  return {
    maxFiles: policy.maxFiles,
    maxSize: policy.maxFileSize,
    accept,
    multiple: policy.maxFiles > 1,
  };
}
