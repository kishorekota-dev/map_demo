const { object } = require('./config');
const { fingerprint } = require('./studio-model');
function semanticDiff(before, after) {
  const changes = [];
  const visit = (path, left, right) => {
    if (left !== undefined && right !== undefined && fingerprint(left) === fingerprint(right)) return;
    if (left === undefined || right === undefined) { changes.push({ path, kind: left === undefined ? 'added' : 'removed', before: left ?? null, after: right ?? null }); return; }
    if (object(left) && object(right)) {
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) visit(path ? `${path}.${key}` : key, left[key], right[key]);
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      if ([...left, ...right].every((entry) => object(entry) && typeof entry.id === 'string')) {
        const a = new Map(left.map((entry) => [entry.id, entry])); const b = new Map(right.map((entry) => [entry.id, entry]));
        for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) visit(`${path}[${id}]`, a.get(id), b.get(id));
        return;
      }
      if ([...left, ...right].every((entry) => !object(entry) && !Array.isArray(entry)) && fingerprint([...left].sort()) === fingerprint([...right].sort())) return;
    }
    changes.push({ path, kind: 'changed', before: left, after: right });
  };
  visit('', before, after);
  return { changes: changes.slice(0, 200), totalChanges: changes.length, truncated: changes.length > 200 };
}
module.exports = { semanticDiff };
