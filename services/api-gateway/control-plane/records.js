const { clone } = require('./config');
const { validateKnowledgeDocument } = require('../operations/knowledgeValidation');
const KINDS = ['suites', 'evaluations', 'approvals', 'knowledge', 'knowledge_published', 'knowledge_versions', 'promotions', 'quality_suites', 'quality_evidence'];
const checkKind = (kind) => { if (!KINDS.includes(kind)) throw new Error('Unknown studio record kind'); };
function answerSource(record) {
  return validateKnowledgeDocument(record, { requireVersion: true }).valid && record.status === 'published'
    && Array.isArray(record.allowedRoles) && record.allowedRoles.length > 0 && record.allowedRoles.length <= 30
    && record.allowedRoles.every(role => typeof role === 'string' && (role === '*' || /^[a-z][a-z0-9_]{0,63}$/.test(role)))
    && (record.expiresAt === null || record.expiresAt === undefined || (typeof record.expiresAt === 'string' && Number.isFinite(Date.parse(record.expiresAt))));
}
function filterRecord(record, filters = {}) {
  return Object.entries(filters).every(([key, value]) => record[key] === value);
}
function memoryRecords(state) {
  state.studioRecords ||= {};
  return {
    async get(kind, id) { checkKind(kind); return clone(state.studioRecords[kind]?.[id] || null); },
    async list(kind, { limit = 50, offset = 0, filters = {} } = {}) {
      checkKind(kind);
      const records = Object.values(state.studioRecords[kind] || {}).filter((record) => filterRecord(record, filters))
        .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '') || a.id.localeCompare(b.id));
      return { items: clone(records.slice(offset, offset + limit)), total: records.length, offset, limit };
    },
    async put(kind, id, value) {
      checkKind(kind); state.studioRecords[kind] ||= {};
      state.studioRecords[kind][id] = clone(value);
    },
    async searchKnowledge(terms, roles, limit, now) {
      const allowed = Object.entries(state.studioRecords.knowledge_published || {}).filter(([id, record]) => id === record?.id && answerSource(record)
        && (!record.expiresAt || Date.parse(record.expiresAt) > Date.parse(now))
        && record.allowedRoles.some((role) => role === '*' || roles.includes(role))).map(([, record]) => record);
      return allowed.map((record) => {
        const words = new Set(`${record.title} ${record.content}`.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
        return { ...clone(record), score: terms.filter((term) => words.has(term)).length / terms.length };
      }).filter((record) => record.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
    }
  };
}
function postgresRecords(client, tenantId) {
  return {
    async get(kind, id) {
      checkKind(kind);
      const result = await client.query('SELECT document FROM servicing_control_plane_records WHERE tenant_id=$1 AND kind=$2 AND id=$3', [tenantId, kind, id]);
      return result.rows[0]?.document || null;
    },
    async list(kind, { limit = 50, offset = 0, filters = {} } = {}) {
      checkKind(kind);
      const clauses = ['tenant_id=$1', 'kind=$2']; const values = [tenantId, kind];
      for (const [key, value] of Object.entries(filters)) {
        if (!['fingerprint', 'suiteId', 'passed', 'documentId', 'status'].includes(key)) throw new Error('Unsupported studio record filter');
        values.push(JSON.stringify({ [key]: value })); clauses.push(`document @> $${values.length}::jsonb`);
      }
      const count = await client.query(`SELECT count(*)::int AS total FROM servicing_control_plane_records WHERE ${clauses.join(' AND ')}`, values);
      values.push(limit, offset);
      const result = await client.query(`SELECT document FROM servicing_control_plane_records WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC, id ASC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
      return { items: result.rows.map((row) => row.document), total: count.rows[0].total, offset, limit };
    },
    async put(kind, id, value) {
      checkKind(kind);
      await client.query('INSERT INTO servicing_control_plane_records (tenant_id,kind,id,document) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (tenant_id,kind,id) DO UPDATE SET document=EXCLUDED.document, updated_at=NOW()', [tenantId, kind, id, JSON.stringify(value)]);
    },
    async searchKnowledge(terms, roles, limit, now) {
      const vector = "to_tsvector('simple', coalesce(document->>'title','') || ' ' || coalesce(document->>'content',''))";
      const result = await client.query(`SELECT id, document, ts_rank_cd(${vector}, to_tsquery('simple',$2)) AS score
        FROM servicing_control_plane_records WHERE tenant_id=$1 AND kind='knowledge_published'
        AND document->>'status'='published' AND jsonb_exists_any(document->'allowedRoles',$3::text[])
        AND (document->>'expiresAt' IS NULL OR (document->>'expiresAt')::timestamptz > $4::timestamptz)
        AND ${vector} @@ to_tsquery('simple',$2) ORDER BY score DESC,id ASC LIMIT $5`, [tenantId, terms.join(' | '), [...roles, '*'], now, limit]);
      return result.rows.filter(row => row.id === row.document?.id && answerSource(row.document)).map((row) => ({ ...row.document, score: Number(row.score) }));
    }
  };
}
module.exports = { memoryRecords, postgresRecords };
