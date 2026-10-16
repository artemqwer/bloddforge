// GramJS only needs `inspect.custom` for pretty-printing objects.
function inspect(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
inspect.custom = Symbol.for('nodejs.util.inspect.custom');

module.exports = { inspect };
