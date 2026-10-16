// Minimal `path` for GramJS file helpers (downloads go to memory, not disk).
function basename(p) {
  const parts = String(p).split('/');
  return parts[parts.length - 1];
}
function join(...parts) {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

module.exports = { basename, join, resolve: join, sep: '/' };
