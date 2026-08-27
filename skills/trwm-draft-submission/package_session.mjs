#!/usr/bin/env node
/**
 * package_session.mjs — turn an authoring draft into a TRWM session file.
 *
 * Usage:
 *   node package_session.mjs draft.json > session.json
 *   node package_session.mjs draft.json --out session.json
 *
 * The draft format is documented in references/session-format.md. It records
 * only what a person decides: the technique, its results, and for each result
 * a set of weaknesses, each split into causes, each carrying its mitigations.
 *
 * This script derives everything the TRWM helper computes for itself —
 * weakness prompt slots, the aggregated weakness list, the index-keyed
 * mitigation map, the mitigation refinement rows, and the mitigation
 * aggregation hash. Those derivations are order-sensitive and easy to get
 * wrong by hand, which is why they live in code and are covered by tests
 * rather than being described in prose and hoped for. The tests that run the
 * packager live alongside it; the ones that check the application still
 * agrees with it live with the application.
 *
 * No dependencies. Node 18 or later.
 */

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * The skill's own version. Distributed copies drift from the repository, so
 * this is how a copy identifies itself — `--version` prints it. It is stated
 * in three places (here, SKILL.md and references/session-format.md) and a
 * test asserts the three agree, so a bump cannot be applied to only one.
 */
const SKILL_VERSION = '0.20.1';

/* The session-state version this packager targets. See
 * references/session-format.md for what to do when the helper moves on. */
const TARGET_APP_VERSION = '3.8.0';

/* Error classes in the order the helper declares them. This order is
 * load-bearing: it determines the order weaknesses aggregate in, and
 * therefore the integer keys that mitigations hang off. */
const ERROR_CLASSES = [
  'ASTM_INCOMP',
  'ASTM_INAC_EX',
  'ASTM_INAC_AS',
  'ASTM_INAC_ALT',
  'ASTM_INAC_COR',
  'ASTM_MISINT',
];

const UNCERTAINTY_SOURCES = [
  'Environmental', 'Process', 'Data', 'Methodology', 'Knowledge',
  'Tools', 'Expert', 'Semantics', 'Probabilities',
];

/* Two results whose mitigations largely coincide were probably one result. The
 * threshold is set where it reports something a person would act on and stays
 * quiet otherwise: a result that shares most of its remedies with another is
 * worth a second look, one that shares half is not. The floor exists because
 * containment is meaningless on a set of two, where a single shared mitigation
 * is already half of it. Both are judgement calls made once here rather than
 * left to the reader of every draft. */
const RESULT_OVERLAP_LIMIT = 0.7;
const MIN_RESULT_MITIGATIONS = 3;

/* The keys importFromFile() will accept. Anything else is silently dropped by
 * the helper, so emitting it is at best noise. */
const ALLOWED_KEYS = [
  'version', 'created', 'modified', 'sessionName', 'authors', 'technique',
  'results', 'resultsNotes', 'rationale', 'weaknessPrompts', 'aggregatedWeaknesses',
  'mitigations', 'mitigationSummary', 'mitigationRefinement',
  'lastMitAggregationHash', 'settings', 'workflowVariant',
];

class DraftError extends Error {}

/* Facts established while packaging that the checks need but the session file
 * must not carry: it is pruned to ALLOWED_KEYS, so anything attached to it
 * would be deleted before it was returned. Keyed by the session object. */
const DIAGNOSTICS = new WeakMap();

/* ── Helpers mirroring the helper application ──────────────── */

/** Mitigation identity, matching normMitKey() in index.html. */
function normMitKey(text) {
  return (text || '')
    .normalize('NFKC')
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Weakness identity during aggregation, matching aggregateWeaknesses(). */
function normWeaknessKey(name) {
  return (name || '').toLowerCase().trim();
}

/** Java-style 32-bit string hash, matching mitigationDataHash(). */
function stringHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h);
}

/**
 * The derived name of a cause. The helper stores each cause as a complete
 * sentence beginning with the effect text; where it does not, it prepends the
 * effect. Reproduced here so a draft may write either form.
 */
function derivedName(effectText, causeText) {
  const raw = causeText.trim();
  return raw.toLowerCase().startsWith(effectText.toLowerCase())
    ? raw
    : `${effectText} ${raw}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ── Draft validation ──────────────────────────────────────── */

function requireString(value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DraftError(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function normaliseReferences(refs, path) {
  if (refs === undefined) return [];
  if (!Array.isArray(refs)) throw new DraftError(`${path} must be an array`);
  return refs.map((r, i) => {
    if (typeof r === 'string') {
      return { DFCite_id: '', citation_text: r.trim(), relevance_summary_280: '' };
    }
    if (!r || typeof r !== 'object') {
      throw new DraftError(`${path}[${i}] must be a string or an object`);
    }
    const id = (r.DFCite_id || '').trim();
    const text = (r.citation_text || '').trim();
    if (!id && !text) {
      throw new DraftError(`${path}[${i}] needs a DFCite_id or a citation_text`);
    }
    if (id && !/^DFCite-\d+$/.test(id)) {
      throw new DraftError(
        `${path}[${i}] has DFCite_id "${id}", which is not a knowledge base ` +
        `citation id. A new source needs citation_text and no id.`
      );
    }
    return {
      DFCite_id: id,
      citation_text: text,
      relevance_summary_280: (r.relevance_summary_280 || '').trim(),
    };
  });
}

/* The draft format, declared once.
 *
 * Two things read this. validateDraft() uses it to reject a key no level
 * recognises and a value of the wrong type — an unrecognised key is a typo,
 * and a typo is silent data loss, because the misspelt key is not read, its
 * contents are dropped, and the run otherwise reports success. And
 * buildDraftSchema() emits references/draft.schema.json from it, so an editor
 * or an agent can validate a draft before the packager ever runs. A test
 * regenerates the schema and compares, so the file and this table cannot
 * drift apart.
 *
 * `type` is 'string', 'string[]', 'object', 'object[]' or 'references'.
 * `level` names the sub-level an object or object[] is checked against.
 * Patterns and lengths are carried here so they reach the schema; the runtime
 * checks that are worth a better message than a pattern gives are left to the
 * dedicated code below.
 */
const DFT_ID = '^(DFT-[0-9]+(\\.[0-9]+)*)?$';
const DFM_ID = '^(DFM-[0-9]+(\\.[0-9]+)*)?$';

const DRAFT_SPEC = {
  '': {
    sessionName: { type: 'string' },
    authors: { type: 'string[]' },
    resultsNotes: { type: 'string' },
    rationale: { type: 'string' },
    technique: { type: 'object', level: 'technique', required: true },
    results: { type: 'object[]', level: 'results[]', required: true, minItems: 1 },
    weaknesses: { type: 'object[]', level: 'weaknesses[]', required: true },
    mitigationDetails: { type: 'object[]', level: 'mitigationDetails[]' },
  },
  'technique': {
    id: { type: 'string' },
    name: { type: 'string', required: true },
    description: { type: 'string', required: true },
    synonyms: { type: 'string[]' },
    details: { type: 'string' },
    examples: { type: 'string[]' },
    inputClasses: { type: 'string[]' },
    parentTechnique: { type: 'string', pattern: DFT_ID },
    references: { type: 'references' },
  },
  'results[]': {
    id: { type: 'string', pattern: '^DFTR[0-9]+$' },
    name: { type: 'string' },
    description: { type: 'string' },
    ontologyOutputClasses: { type: 'string[]' },
    ontologyInputClasses: { type: 'string[]' },
  },
  'weaknesses[]': {
    result: { type: 'string' },
    errorClasses: { type: 'string[]', required: true, minItems: 1, enum: ERROR_CLASSES },
    effect: { type: 'string', required: true },
    causes: { type: 'object[]', level: 'causes[]' },
    description: { type: 'string' },
    references: { type: 'references' },
    mitigations: { type: 'object[]', level: 'mitigations[]' },
  },
  'causes[]': {
    text: { type: 'string', required: true },
    description: { type: 'string' },
    references: { type: 'references' },
    mitigations: { type: 'object[]', level: 'mitigations[]' },
  },
  'mitigations[]': {
    text: { type: 'string', required: true },
    existingId: { type: 'string', pattern: DFM_ID },
    description: { type: 'string' },
  },
  'mitigationDetails[]': {
    text: { type: 'string', required: true },
    description: { type: 'string' },
    technique: { type: 'string', pattern: DFT_ID },
    references: { type: 'references' },
  },
  'reference': {
    DFCite_id: { type: 'string', pattern: '^(DFCite-[0-9]+)?$' },
    citation_text: { type: 'string' },
    relevance_summary_280: { type: 'string', maxLength: 280 },
  },
};

/** Levenshtein distance, for suggesting what a misspelt key was meant to be. */
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[a.length][b.length];
}

/** The allowed key a misspelling most likely meant, or null if none is close. */
function nearestKey(key, allowed) {
  let best = null, bestD = Infinity;
  for (const a of allowed) {
    const d = editDistance(key.toLowerCase(), a.toLowerCase());
    if (d < bestD) { bestD = d; best = a; }
  }
  // Two edits on a short key is already a different word; scale with length.
  return bestD <= Math.max(2, Math.floor(key.length / 4)) ? best : null;
}

function describeType(t) {
  return { 'string': 'a string', 'string[]': 'an array of strings',
    'object': 'an object', 'object[]': 'an array of objects',
    'references': 'an array of references' }[t];
}

function typeMatches(value, t) {
  switch (t) {
    case 'string': return typeof value === 'string';
    case 'string[]': return Array.isArray(value) && value.every(v => typeof v === 'string');
    case 'object': return !!value && typeof value === 'object' && !Array.isArray(value);
    case 'object[]': return Array.isArray(value) && value.every(
      v => !!v && typeof v === 'object' && !Array.isArray(v));
    case 'references': return Array.isArray(value) && value.every(
      v => typeof v === 'string' || (!!v && typeof v === 'object' && !Array.isArray(v)));
    default: return true;
  }
}

/**
 * Check one object against a level of the spec, then walk into it. Keys
 * beginning with an underscore are comments and are ignored, which is how the
 * shipped example carries its _note.
 */
function checkLevel(obj, level, path) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  const spec = DRAFT_SPEC[level];
  const allowed = Object.keys(spec);

  for (const k of Object.keys(obj)) {
    if (k.startsWith('_')) continue;
    if (!Object.hasOwn(spec, k)) {
      const near = nearestKey(k, allowed);
      throw new DraftError(
        `${path} has an unrecognised key "${k}"` +
        (near ? `. Did you mean "${near}"?` : `. Allowed here: ${allowed.join(', ')}.`) +
        ` An unrecognised key is ignored, so leaving it would silently drop` +
        ` whatever it holds.`
      );
    }
    const value = obj[k];
    if (value === undefined || value === null) continue;
    if (!typeMatches(value, spec[k].type)) {
      throw new DraftError(
        `${path}.${k} must be ${describeType(spec[k].type)}, but is ` +
        `${Array.isArray(value) ? 'an array' : typeof value}`
      );
    }
  }

  for (const [k, def] of Object.entries(spec)) {
    const value = obj[k];
    if (value === undefined || value === null) continue;
    if (def.type === 'object') checkLevel(value, def.level, `${path === 'the draft' ? '' : path + '.'}${k}`);
    if (def.type === 'object[]') {
      const base = path === 'the draft' ? k : `${path}.${k}`;
      value.forEach((v, i) => checkLevel(v, def.level, `${base}[${i}]`));
    }
    if (def.type === 'references') {
      const base = path === 'the draft' ? k : `${path}.${k}`;
      value.forEach((v, i) => {
        if (typeof v === 'object') checkLevel(v, 'reference', `${base}[${i}]`);
      });
    }
  }
}

/** Walk a draft and reject any key or value the format does not allow. */
function checkDraftKeys(draft) {
  checkLevel(draft, '', 'the draft');
}

/**
 * The draft format as a JSON Schema, generated from DRAFT_SPEC so the two
 * cannot disagree. Written to references/draft.schema.json; a test regenerates
 * it and compares.
 */
export function buildDraftSchema() {
  // The $defs name for a level: the level's own name without the [] marker.
  const defName = level => level === '' ? 'draft' : level.replace(/\[\]$/, '');

  const propertySchema = (def) => {
    switch (def.type) {
      case 'string': {
        const o = { type: 'string' };
        if (def.pattern) o.pattern = def.pattern;
        if (def.maxLength) o.maxLength = def.maxLength;
        return o;
      }
      case 'string[]': {
        const items = { type: 'string' };
        if (def.enum) items.enum = [...def.enum];
        const o = { type: 'array', items };
        if (def.minItems) o.minItems = def.minItems;
        return o;
      }
      case 'object':
        return { $ref: `#/$defs/${defName(def.level)}` };
      case 'object[]': {
        const o = { type: 'array', items: { $ref: `#/$defs/${defName(def.level)}` } };
        if (def.minItems) o.minItems = def.minItems;
        return o;
      }
      case 'references':
        return { type: 'array', items: { $ref: '#/$defs/reference' } };
      default:
        return {};
    }
  };

  const levelSchema = (level) => {
    const spec = DRAFT_SPEC[level];
    const properties = {};
    const required = [];
    for (const [k, def] of Object.entries(spec)) {
      properties[k] = propertySchema(def);
      if (def.required) required.push(k);
    }
    const o = { type: 'object', properties };
    if (required.length) o.required = required;
    // Underscore-prefixed keys are drafting comments; everything else is a typo.
    o.patternProperties = { '^_': true };
    o.additionalProperties = false;
    return o;
  };

  const $defs = {};
  for (const level of Object.keys(DRAFT_SPEC)) {
    if (level === '') continue;
    $defs[defName(level)] = levelSchema(level);
  }
  // A reference may also be given as a bare citation string.
  $defs.reference = { anyOf: [{ type: 'string' }, $defs.reference] };

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://raw.githubusercontent.com/chrishargreaves/trwm-claude-skill/main/skills/trwm-draft-submission/references/draft.schema.json',
    title: 'trwm-draft-submission authoring draft',
    description:
      'The draft package_session.mjs reads. Not the TRWM session file: that is ' +
      'generated from this and must never be hand-written. Generated from ' +
      'DRAFT_SPEC in package_session.mjs — edit that, not this file.',
    ...levelSchema(''),
    $defs,
  };
}

function validateDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new DraftError('the draft must be a JSON object');
  }
  checkDraftKeys(draft);
  assertNoDoubledWeaknessFields(draft);
  if (!draft.technique || typeof draft.technique !== 'object') {
    throw new DraftError('the draft needs a "technique" object');
  }
  requireString(draft.technique.name, 'technique.name');
  requireString(draft.technique.description, 'technique.description');

  if (!Array.isArray(draft.results) || draft.results.length === 0) {
    throw new DraftError('the draft needs at least one entry in "results"');
  }
  if (!Array.isArray(draft.weaknesses)) {
    throw new DraftError('"weaknesses" must be an array (it may be empty)');
  }
}

/* ── Build ─────────────────────────────────────────────────── */

function buildTechnique(draft) {
  const t = draft.technique;
  return {
    id: (t.id || 'DFT-XXXX').trim() || 'DFT-XXXX',
    name: t.name.trim(),
    description: t.description.trim(),
    synonyms: Array.isArray(t.synonyms) ? t.synonyms.map(s => String(s).trim()).filter(Boolean) : [],
    details: (t.details || '').trim(),
    examples: Array.isArray(t.examples) ? t.examples.map(s => String(s).trim()).filter(Boolean) : [],
    inputClasses: Array.isArray(t.inputClasses) ? [...t.inputClasses] : [],
    parentTechnique: (t.parentTechnique || '').trim(),
    references: normaliseReferences(t.references, 'technique.references'),
  };
}

function buildResults(draft) {
  return draft.results.map((r, i) => {
    if (!r || typeof r !== 'object') {
      throw new DraftError(`results[${i}] must be an object`);
    }
    const id = (r.id || `DFTR${i + 1}`).trim();
    if (!/^DFTR\d+$/.test(id)) {
      throw new DraftError(`results[${i}].id must look like "DFTR1", got "${id}"`);
    }
    return {
      id,
      name: (r.name || '').trim(),
      description: (r.description || '').trim(),
      ontologyOutputClasses: Array.isArray(r.ontologyOutputClasses) ? [...r.ontologyOutputClasses] : [],
      ontologyInputClasses: Array.isArray(r.ontologyInputClasses) ? [...r.ontologyInputClasses] : [],
    };
  });
}

/**
 * Build the prompt slots. Each drafted weakness becomes one slot, filed under
 * the first of its error classes, in the result it belongs to. Slot order
 * within an error class follows draft order.
 */
/**
 * A weakness may carry `mitigations`, `description` and `references` itself, or
 * on its causes — never both. With causes present the aggregation reads them
 * from the cause, so weakness-level values were silently dropped. Which cause
 * a weakness-level mitigation belongs to cannot be worked out, so this is
 * refused rather than guessed at.
 */
function assertNoDoubledWeaknessFields(draft) {
  (draft.weaknesses || []).forEach((w, i) => {
    if (!w || typeof w !== 'object') return;
    const causes = Array.isArray(w.causes) ? w.causes.filter(c => c && c.text && String(c.text).trim()) : [];
    if (!causes.length) return;
    for (const key of ['mitigations', 'description', 'references']) {
      const v = w[key];
      const present = Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v != null;
      if (present) {
        throw new DraftError(
          `weaknesses[${i}] has both causes and its own "${key}". With causes present the ` +
          `helper attaches ${key} to each cause, so a value here would be dropped without ` +
          `a word. Move it onto the cause or causes it belongs to.`
        );
      }
    }
  });
}

function buildWeaknessPrompts(draft, results) {
  const resultIds = new Set(results.map(r => r.id));
  const prompts = {};
  for (const r of results) {
    prompts[r.id] = {};
    for (const ec of ERROR_CLASSES) prompts[r.id][ec] = [];
  }

  draft.weaknesses.forEach((w, i) => {
    const path = `weaknesses[${i}]`;
    if (!w || typeof w !== 'object') throw new DraftError(`${path} must be an object`);

    const effect = requireString(w.effect, `${path}.effect`);
    const resultId = (w.result || results[0].id).trim();
    if (!resultIds.has(resultId)) {
      throw new DraftError(`${path}.result is "${resultId}", which is not one of the declared results`);
    }

    const classes = Array.isArray(w.errorClasses) ? w.errorClasses : [];
    if (classes.length === 0) {
      throw new DraftError(`${path}.errorClasses must name at least one ASTM error class`);
    }
    for (const c of classes) {
      if (!ERROR_CLASSES.includes(c)) {
        throw new DraftError(`${path}.errorClasses contains "${c}", which is not a recognised class`);
      }
    }

    const additionalErrors = {};
    for (const ec of ERROR_CLASSES) additionalErrors[ec] = classes.includes(ec);

    const causes = Array.isArray(w.causes) ? w.causes : [];
    causes.forEach((c, j) => {
      if (!c || typeof c !== 'object') throw new DraftError(`${path}.causes[${j}] must be an object`);
      requireString(c.text, `${path}.causes[${j}].text`);
    });

    prompts[resultId][classes[0]].push({
      text: effect,
      additionalErrors,
      causes: causes.map(c => ({ text: c.text.trim() })),
      // Not part of the helper's slot shape — carried so the aggregation step
      // below can find the drafted description, references and mitigations
      // without re-walking the draft. Stripped before output.
      _draft: { index: i, weakness: w, resultId, classes },
    });
  });

  return prompts;
}

/**
 * Reproduce aggregateWeaknesses() exactly: walk results in insertion order,
 * then error classes in declared order, then slots in array order, then
 * causes in array order; deduplicate on the lowercased name, first occurrence
 * fixing the position.
 *
 * Returns the aggregated rows together with the drafted mitigations that
 * belong to each, since both are keyed by the same index.
 */
function aggregate(prompts, emissions = []) {
  const groups = new Map();

  for (const resultId of Object.keys(prompts)) {
    for (const ec of ERROR_CLASSES) {
      for (const slot of prompts[resultId][ec]) {
        const effect = slot.text.trim();
        const draftWeakness = slot._draft.weakness;
        const causes = slot.causes.filter(c => c.text && c.text.trim());

        const emit = (name, extra, source) => {
          const key = normWeaknessKey(name);
          emissions.push({ key, name, resultId, ec, causeText: extra.causeText });
          const existing = groups.get(key);
          if (!existing) {
            const uncertaintySource = {};
            for (const us of UNCERTAINTY_SOURCES) uncertaintySource[us] = false;
            groups.set(key, {
              name,
              categories: [...slot._draft.classes].sort(
                (a, b) => ERROR_CLASSES.indexOf(a) - ERROR_CLASSES.indexOf(b)
              ),
              sourceResults: [resultId],
              references: normaliseReferences(source.references, 'weakness references'),
              description: (source.description || '').trim(),
              uncertaintySource,
              ...extra,
              mitigations: Array.isArray(source.mitigations) ? [...source.mitigations] : [],
            });
          } else {
            existing.sourceResults.push(resultId);
            for (const c of slot._draft.classes) {
              if (!existing.categories.includes(c)) existing.categories.push(c);
            }
            existing.categories.sort(
              (a, b) => ERROR_CLASSES.indexOf(a) - ERROR_CLASSES.indexOf(b)
            );
            if (Array.isArray(source.mitigations)) existing.mitigations.push(...source.mitigations);
          }
        };

        if (causes.length === 0) {
          emit(effect, {
            derivedFromText: undefined,
            causeText: undefined,
            baseKey: undefined,
          }, draftWeakness);
        } else {
          const baseKey = `${effect}|${ec}`;
          for (const c of causes) {
            const raw = c.text.trim();
            const source = (draftWeakness.causes || []).find(dc => dc.text.trim() === raw) || {};
            emit(derivedName(effect, raw), {
              derivedFromText: effect,
              causeText: raw,
              baseKey,
            }, source);
          }
        }
      }
    }
  }

  return [...groups.values()];
}

function buildMitigations(groups) {
  const mitigations = {};
  groups.forEach((g, i) => {
    const seen = new Set();
    mitigations[i] = [];
    for (const m of g.mitigations) {
      const text = typeof m === 'string' ? m : (m && m.text) || '';
      if (!text.trim()) continue;
      const key = normMitKey(text);
      if (seen.has(key)) continue;
      seen.add(key);
      mitigations[i].push({
        text: text.trim(),
        existingId: (typeof m === 'object' && m.existingId ? m.existingId : '').trim(),
        description: (typeof m === 'object' && m.description ? m.description : '').trim(),
      });
    }
  });
  return mitigations;
}

/** Reproduce aggregateMitigations(). */
function buildMitigationRefinement(mitigations, draft) {
  const seen = new Map();
  const order = [];

  for (const wi of Object.keys(mitigations)) {
    for (const mit of mitigations[wi]) {
      if (!mit.text.trim()) continue;
      const key = normMitKey(mit.text);
      if (!seen.has(key)) {
        seen.set(key, {
          name: mit.text.trim(),
          originalKey: key,
          existingId: mit.existingId || '',
          description: '',
          occurrences: 0,
          weaknessIndices: [],
          references: [],
          linkedTechniques: [],
        });
        order.push(key);
      }
      const entry = seen.get(key);
      entry.occurrences++;
      if (mit.existingId) entry.existingId = mit.existingId;
      if (mit.description && !entry.description) entry.description = mit.description;
      const wiNum = parseInt(wi, 10);
      if (!entry.weaknessIndices.includes(wiNum)) entry.weaknessIndices.push(wiNum);
    }
  }

  // Optional per-mitigation extras the draft may declare once, keyed by text.
  const extras = new Map();
  for (const m of draft.mitigationDetails || []) {
    if (!m || !m.text) continue;
    extras.set(normMitKey(m.text), m);
  }

  return order.map((key, i) => {
    const e = seen.get(key);
    const extra = extras.get(key);
    return {
      index: i,
      name: e.name,
      originalKey: key,
      existingId: e.existingId,
      occurrences: e.occurrences,
      weaknessIndices: e.weaknessIndices,
      description: extra && extra.description ? extra.description.trim() : e.description,
      references: extra ? normaliseReferences(extra.references, 'mitigationDetails references') : [],
      linkedTechniques: extra && extra.technique ? [String(extra.technique).trim()] : [],
    };
  });
}

function mitigationDataHash(mitigations) {
  let s = '';
  for (const wi of Object.keys(mitigations)) {
    // A damaged session is exactly what --repair is handed, so nothing here
    // may assume a well-formed shape. The helper guards the same way.
    for (const m of (Array.isArray(mitigations[wi]) ? mitigations[wi] : [])) {
      if (m && m.text && m.text.trim()) s += normMitKey(m.text) + '|';
    }
  }
  return stringHash(s);
}

export function packageSession(draft, options = {}) {
  validateDraft(draft);

  const now = options.date || today();
  const technique = buildTechnique(draft);
  const results = buildResults(draft);
  const prompts = buildWeaknessPrompts(draft, results);
  const emissions = [];
  const groups = aggregate(prompts, emissions);
  const mitigations = buildMitigations(groups);

  const aggregatedWeaknesses = groups.map((g, i) => {
    const row = {
      index: i,
      name: g.name,
      originalName: g.name,
      description: g.description,
      categories: g.categories,
      references: g.references,
      uncertaintySource: g.uncertaintySource,
      sourceResults: g.sourceResults,
      derivedFromText: g.derivedFromText,
      causeText: g.causeText,
      baseKey: g.baseKey,
    };
    return row;
  });

  // Strip the authoring-only payload from the slots.
  for (const rId of Object.keys(prompts)) {
    for (const ec of ERROR_CLASSES) {
      for (const slot of prompts[rId][ec]) delete slot._draft;
    }
  }

  const session = {
    version: TARGET_APP_VERSION,
    created: now,
    modified: now,
    sessionName: (draft.sessionName || technique.name || 'Drafted submission').trim(),
    authors: Array.isArray(draft.authors) ? draft.authors.map(a => String(a).trim()).filter(Boolean) : [],
    workflowVariant: 'TRWM-AC',
    technique,
    results,
    resultsNotes: (draft.resultsNotes || '').trim(),
    rationale: (draft.rationale || '').trim(),
    weaknessPrompts: prompts,
    aggregatedWeaknesses,
    mitigations,
    mitigationSummary: [],
    mitigationRefinement: buildMitigationRefinement(mitigations, draft),
    lastMitAggregationHash: mitigationDataHash(mitigations),
  };

  for (const k of Object.keys(session)) {
    if (!ALLOWED_KEYS.includes(k)) delete session[k];
  }
  const matchedKeys = new Set(session.mitigationRefinement.map(m => m.originalKey));
  const unmatchedDetails = (draft.mitigationDetails || [])
    .filter(m => m && m.text && !matchedKeys.has(normMitKey(m.text)))
    .map(m => String(m.text).trim());
  DIAGNOSTICS.set(session, { emissions, unmatchedDetails });
  return session;
}

/**
 * Things to confirm rather than fix. Reusing an existing mitigation is normal
 * and desirable, but the export pairs the id supplied here with the text
 * supplied here — so reworded text against a real id proposes renaming that
 * mitigation across the knowledge base, silently. There is no way to verify
 * the name offline, so surface every reuse and what it is attached to, and
 * let a person check it against the knowledge base.
 */
/**
 * SOLVE-IT's style guide states that US English is used throughout, which is
 * easy to miss when the drafting conversation is in British English. Only
 * unambiguous pairs are listed: "disc" is omitted because an optical disc is
 * spelled that way in US English too, and "practice" because the British
 * noun/verb split makes it context-dependent.
 */
const BRITISH_TO_US = {
  artefact: 'artifact', artefacts: 'artifacts',
  analyse: 'analyze', analysed: 'analyzed', analysing: 'analyzing',
  organise: 'organize', organised: 'organized', organisation: 'organization',
  recognise: 'recognize', recognised: 'recognized',
  prioritise: 'prioritize', standardise: 'standardize',
  normalise: 'normalize', initialise: 'initialize',
  utilise: 'utilize', summarise: 'summarize',
  behaviour: 'behavior', colour: 'color', catalogue: 'catalog',
  centre: 'center', defence: 'defense', offence: 'offense',
  labelled: 'labeled', modelled: 'modeled', cancelled: 'canceled',
  travelled: 'traveled', fulfil: 'fulfill', enrol: 'enroll',
  programme: 'program', grey: 'gray', ageing: 'aging',
  judgement: 'judgment', acknowledgement: 'acknowledgment',
  whilst: 'while', amongst: 'among', learnt: 'learned',
};

/**
 * A label that identifies one item in a message. Causes of the same effect
 * share a long common prefix, so a plain truncation makes several of them
 * indistinguishable — the index is what tells them apart.
 */
function label(kind, index, name) {
  const n = name.length > 54 ? name.slice(0, 54) + '…' : name;
  return `${kind} ${index + 1} "${n}"`;
}

/** Every free-text field in a session, paired with a label for messages. */
function allText(session) {
  const t = session.technique;
  const out = [
    ['the technique name', t.name],
    ['the technique description', t.description],
    ['the technique details', t.details],
    ...(t.synonyms || []).map((s, i) => [`technique synonym ${i + 1}`, s]),
    ...(t.examples || []).map((s, i) => [`technique example ${i + 1}`, s]),
  ];
  for (const r of session.results) {
    out.push([`${r.id} name`, r.name], [`${r.id} description`, r.description]);
  }
  session.aggregatedWeaknesses.forEach((w, i) => {
    out.push([label('weakness', i, w.name), w.name]);
    if (w.description) out.push([`the description of ${label('weakness', i, w.name)}`, w.description]);
  });
  session.mitigationRefinement.forEach((m, i) => {
    out.push([label('mitigation', i, m.name), m.name]);
    if (m.description) out.push([`the description of ${label('mitigation', i, m.name)}`, m.description]);
  });
  return out.filter(([, v]) => v && v.trim());
}

/** The names the style guide governs: sentence case, no trailing full stop. */
function allNames(session) {
  return [
    ['the technique name', session.technique.name],
    ...session.aggregatedWeaknesses.map((w, i) => [label('weakness', i, w.name), w.name]),
    ...session.mitigationRefinement.map((m, i) => [label('mitigation', i, m.name), m.name]),
  ].filter(([, v]) => v && v.trim());
}

/** Every reference list in a session, paired with a label for messages. */
function allReferences(session) {
  const out = [['the technique', session.technique.references || []]];
  session.aggregatedWeaknesses.forEach(w => {
    out.push([label('weakness', session.aggregatedWeaknesses.indexOf(w), w.name), w.references || []]);
  });
  session.mitigationRefinement.forEach(m => {
    out.push([label('mitigation', session.mitigationRefinement.indexOf(m), m.name), m.references || []]);
  });
  return out;
}

export function notes(session, verifiedMitigationIds = new Set()) {
  const out = [];
  const byId = new Map();

  // A source not already in the knowledge base exports as a plain string for a
  // maintainer to match by hand, so it is worth naming before submission.
  const fresh = new Set();
  for (const [, refs] of allReferences(session)) {
    for (const r of refs) if (!r.DFCite_id && r.citation_text) fresh.add(r.citation_text);
  }
  for (const c of fresh) {
    out.push(
      `cites a source with no DFCite id — "${c.slice(0, 120)}${c.length > 120 ? '…' : ''}". ` +
      `It will export as plain text for a maintainer to match against an ` +
      `existing citation or allocate a new id.`
    );
  }

  for (const [wi, mits] of Object.entries(session.mitigations)) {
    for (const m of mits) {
      if (!m.existingId) continue;
      if (!byId.has(m.existingId)) byId.set(m.existingId, { text: m.text, weaknesses: [] });
      const e = byId.get(m.existingId);
      e.weaknesses.push(Number(wi));
      if (e.text !== m.text) {
        out.push(
          `${m.existingId} is used with two different wordings — "${e.text}" and ` +
          `"${m.text}". These will export as one mitigation with whichever the ` +
          `refinement row holds.`
        );
      }
    }
  }

  for (const [id, e] of byId) {
    const names = e.weaknesses
      .map(i => session.aggregatedWeaknesses[i] && session.aggregatedWeaknesses[i].name)
      .filter(Boolean);
    const attached =
      `Attached to ${names.length} weakness${names.length === 1 ? '' : 'es'}: ` +
      names.map(n => `"${n}"`).join('; ');
    // Where --kb has compared the text against the recorded name, asking for
    // that comparison again is asking for work already done.
    out.push(verifiedMitigationIds.has(id)
      ? `reuses ${id} as "${e.text}", which matches its name in the knowledge ` +
        `base. ${attached}`
      : `reuses ${id} as "${e.text}" — confirm this matches the name in the ` +
        `knowledge base exactly, or the submission proposes renaming it. ` +
        `${attached}`);
  }

  return out;
}

/** Checks that hold regardless of what the helper does. Returns messages. */
export function selfCheck(session) {
  const problems = [];

  const weaknessCount = session.aggregatedWeaknesses.length;
  const mitKeys = Object.keys(session.mitigations).map(Number).sort((a, b) => a - b);
  for (const k of mitKeys) {
    if (k < 0 || k >= weaknessCount) {
      problems.push(`mitigations has key ${k}, but there are only ${weaknessCount} weaknesses`);
    }
  }

  session.aggregatedWeaknesses.forEach((w, i) => {
    if (w.index !== i) problems.push(`aggregatedWeaknesses[${i}].index is ${w.index}`);
    if (!w.name.trim()) problems.push(`aggregatedWeaknesses[${i}] has no name`);
    if (!w.categories.length) problems.push(`"${w.name}" has no error class`);
    if (!(session.mitigations[i] || []).length) {
      problems.push(`"${w.name}" has no mitigation`);
    }
  });

  // The schema permits extra keys, because importFromFile() drops them rather
  // than refusing the file. Dropping is exactly what makes them worth
  // reporting: anything here is content that will not survive the import.
  // Always empty for a freshly packaged session, since ALLOWED_KEYS has
  // already pruned it — this earns its place under --check.
  for (const k of Object.keys(session)) {
    if (!ALLOWED_KEYS.includes(k)) {
      problems.push(
        `"${k}" is not a key the helper accepts, and its contents will be dropped on import`
      );
    }
  }

  // Facts the published schema also encodes. Checked here in plain code so a
  // run without a reachable schema still catches them, and so the message
  // names the thing rather than a JSON pointer.
  for (const [i, r] of session.results.entries()) {
    if (!/^DFTR[0-9]+$/.test(r.id || '')) {
      problems.push(`results[${i}].id is "${r.id}", which is not of the form DFTR1`);
    }
  }
  for (const k of Object.keys(session.mitigations)) {
    if (!/^[0-9]+$/.test(k)) {
      problems.push(`mitigations is keyed by "${k}"; keys are weakness indices written as integers`);
    }
  }
  for (const [i, w] of session.aggregatedWeaknesses.entries()) {
    for (const c of w.categories || []) {
      if (!ERROR_CLASSES.includes(c)) {
        problems.push(`${label('weakness', i, w.name)} has error class "${c}", which is not one of the six`);
      }
    }
  }
  if (session.workflowVariant !== 'TRWM-AC') {
    problems.push(`workflowVariant is "${session.workflowVariant}"; this skill writes TRWM-AC sessions`);
  }
  const expectedHash = mitigationDataHash(session.mitigations);
  if (session.lastMitAggregationHash !== expectedHash) {
    problems.push(
      `lastMitAggregationHash is ${session.lastMitAggregationHash} but the mitigations hash to ` +
      `${expectedHash}; the helper will warn that the mitigations have changed since aggregation`
    );
  }

  if (!session.results.length) problems.push('no results declared');
  for (const r of session.results) {
    if (!(r.ontologyOutputClasses || []).length) {
      problems.push(`${r.id} has no CASE output class`);
    }
  }

  // Style guide: sentence case, and names do not end with a full stop. Every
  // one of the 191 techniques, 358 weaknesses and 285 mitigations in the
  // knowledge base begins with a capital, so this is settled practice.
  for (const [where, name] of allNames(session)) {
    if (/^[a-z]/.test(name)) {
      problems.push(`${where} starts with a lower-case letter; SOLVE-IT uses sentence case`);
    }
    if (/\.$/.test(name.trim())) {
      problems.push(`${where} ends with a full stop; names do not`);
    }
  }

  // Style guide: US English throughout.
  for (const [where, text] of allText(session)) {
    const seen = new Set();
    for (const m of text.matchAll(/\b[A-Za-z]+\b/g)) {
      const lower = m[0].toLowerCase();
      const us = BRITISH_TO_US[lower];
      if (us && !seen.has(lower)) {
        seen.add(lower);
        problems.push(`${where} uses "${m[0]}"; SOLVE-IT uses US English ("${us}")`);
      }
    }
  }

  // The field name declares its own limit, and the helper does not enforce it.
  for (const [where, refs] of allReferences(session)) {
    for (const r of refs) {
      const n = (r.relevance_summary_280 || '').length;
      if (n > 280) {
        problems.push(`${where}: a relevance summary is ${n} characters, over the 280 limit`);
      }
      // A reference with no DFCite id exports as a bare citation string, so
      // the summary is dropped by the helper before the submission parser
      // ever sees it. Writing one here loses it silently.
      if (n > 0 && !r.DFCite_id) {
        problems.push(
          `${where}: a relevance summary is written against a source with no ` +
          `DFCite id, and will be discarded on export. Use the source's ` +
          `DFCite id, or keep the summary in the companion note.`
        );
      }
    }
  }

  // Two causes that reduce to the same name become one weakness, and their
  // mitigations are combined. Across results or error classes that is the
  // intended merge. Within one result and one error class it is a duplicate,
  // and the drafter loses a cause with nothing on screen to say so.
  const diag = DIAGNOSTICS.get(session);
  if (diag) {
    const bySlot = new Map();
    for (const e of diag.emissions) {
      const slotKey = `${e.key}\u0000${e.resultId}\u0000${e.ec}`;
      if (!bySlot.has(slotKey)) bySlot.set(slotKey, []);
      bySlot.get(slotKey).push(e);
    }
    for (const [, group] of bySlot) {
      if (group.length < 2) continue;
      problems.push(
        `${group.length} causes under ${group[0].resultId} / ${group[0].ec} reduce to ` +
        `the same weakness, "${group[0].name}", and merge into one. ` +
        `${group.length - 1} of them will be lost. Reword them so they differ, ` +
        `or remove the duplicates.`
      );
    }
  }

  // The helper stores each cause as a sentence beginning with its effect, and
  // prepends the effect where a draft does not. Prepending a cause that is
  // already a sentence produces a name that reads as two sentences run
  // together, which is what a reviewer sees.
  for (const [i, w] of session.aggregatedWeaknesses.entries()) {
    if (!w.derivedFromText || !w.causeText) continue;
    if (!w.causeText.toLowerCase().startsWith(w.derivedFromText.toLowerCase())) {
      problems.push(
        `${label('weakness', i, w.name)}: the cause does not begin with its effect, ` +
        `so the effect was prepended. Write the cause as a complete sentence ` +
        `starting "${w.derivedFromText}".`
      );
    }
  }

  // Mitigation identity is the text with whitespace collapsed and case folded,
  // and nothing else. Two texts differing only in punctuation stay separate,
  // which is one mitigation proposed twice.
  const loose = t => (t || '').normalize('NFKC').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const byLoose = new Map();
  for (const m of session.mitigationRefinement) {
    const k = loose(m.name);
    if (!k) continue;
    if (!byLoose.has(k)) byLoose.set(k, []);
    byLoose.get(k).push(m.name);
  }
  for (const [, names] of byLoose) {
    if (names.length < 2) continue;
    problems.push(
      `these mitigations differ only in punctuation or spacing, so they will be ` +
      `submitted as separate mitigations: ${names.map(n => `"${n}"`).join(' and ')}`
    );
  }

  // Identifiers written into the session by hand, checked for shape only.
  // Whether they exist is a knowledge base question — see knowledgeBaseChecks().
  const DFT = /^DFT-\d+(\.\d+)*$/;
  // DFT-XXXX is the placeholder for a new technique; anything else has to be a
  // real id. This is the identifier that names the whole submission, and it
  // was the one the skill never checked.
  const tid = (session.technique.id || '').trim();
  if (tid && tid !== 'DFT-XXXX' && !DFT.test(tid)) {
    problems.push(
      `technique.id is "${tid}", which is neither DFT-XXXX for a new technique ` +
      `nor an id of the form DFT-1234`
    );
  }
  if (session.technique.parentTechnique && !DFT.test(session.technique.parentTechnique)) {
    problems.push(
      `parentTechnique is "${session.technique.parentTechnique}", which is not a ` +
      `technique id of the form DFT-1234`
    );
  }
  for (const [i, m] of session.mitigationRefinement.entries()) {
    for (const t of m.linkedTechniques || []) {
      if (!DFT.test(t)) {
        problems.push(
          `${label('mitigation', i, m.name)} names technique "${t}", which is not a ` +
          `technique id of the form DFT-1234`
        );
      }
    }
    if (m.existingId && !/^DFM-\d+(\.\d+)*$/.test(m.existingId)) {
      problems.push(
        `${label('mitigation', i, m.name)} has existingId "${m.existingId}", which is ` +
        `not a mitigation id of the form DFM-1234`
      );
    }
  }

  // mitigationDetails are matched to a mitigation by normalised text, which
  // folds case and whitespace but not punctuation. An entry that matches
  // nothing takes its description, references and linked technique with it.
  const diagExtras = DIAGNOSTICS.get(session);
  if (diagExtras && diagExtras.unmatchedDetails) {
    for (const t of diagExtras.unmatchedDetails) {
      problems.push(
        `mitigationDetails for "${t}" matches no mitigation, so its description, ` +
        `references and linked technique are dropped. The text has to match a ` +
        `mitigation exactly apart from case and spacing.`
      );
    }
  }

  const slotTotal = Object.values(session.weaknessPrompts)
    .flatMap(byEc => Object.values(byEc))
    .reduce((n, slots) => n + slots.length, 0);
  if (slotTotal === 0) problems.push('no weakness prompt slots were written');

  return problems;
}

/**
 * Advisory checks about how the draft is shaped, rather than whether the file
 * is sound. Separate from selfCheck() for the same reason knowledgeBaseChecks()
 * is: `--check` exists to diagnose a session that will not load, and a question
 * about the result list is not a defect in the file. Running it there would
 * make a valid session exit 1.
 */
export function draftingChecks(session) {
  const problems = [];
  // A result is drafting scaffolding. Nothing downstream records it and every
  // weakness lands on the technique whatever result it was gathered under, so
  // a result's only justification is that asking about that output surfaced
  // failures the other results did not. That is visible once the mitigations
  // exist and not before — stage 4's tests are applied while the list is being
  // proposed, when there is no evidence to test against — so this is the check
  // that has something behind it, and it is deliberately retrospective.
  const mitsByResult = new Map();
  for (const [i, w] of session.aggregatedWeaknesses.entries()) {
    const keys = (session.mitigations[String(i)] || []).map(m => normMitKey(m.text));
    for (const r of w.sourceResults || []) {
      if (!mitsByResult.has(r)) mitsByResult.set(r, new Set());
      for (const k of keys) mitsByResult.get(r).add(k);
    }
  }
  const withMits = [...mitsByResult.keys()];
  if (withMits.length > 1) {
    for (const id of withMits) {
      const mine = mitsByResult.get(id);
      if (mine.size < MIN_RESULT_MITIGATIONS) continue;
      const elsewhere = new Set();
      for (const other of withMits) {
        if (other === id) continue;
        for (const k of mitsByResult.get(other)) elsewhere.add(k);
      }
      if ([...mine].every(k => elsewhere.has(k))) {
        problems.push(
          `every mitigation under ${id} also appears under another result, so ${id} ` +
          `produced nothing the others did not. A result costs six prompts and is not ` +
          `recorded anywhere downstream, so consider whether it is a separate result.`
        );
      }
    }
    for (let a = 0; a < withMits.length; a++) {
      for (let b = a + 1; b < withMits.length; b++) {
        const A = mitsByResult.get(withMits[a]);
        const B = mitsByResult.get(withMits[b]);
        if (A.size < MIN_RESULT_MITIGATIONS || B.size < MIN_RESULT_MITIGATIONS) continue;
        const shared = [...A].filter(k => B.has(k)).length;
        const inA = shared / A.size;
        const inB = shared / B.size;
        if (Math.max(inA, inB) < RESULT_OVERLAP_LIMIT) continue;
        const [narrow, wide, ratio] = inA >= inB
          ? [withMits[a], withMits[b], inA]
          : [withMits[b], withMits[a], inB];
        problems.push(
          `${Math.round(ratio * 100)}% of the mitigations under ${narrow} also appear ` +
          `under ${wide}. Two results whose remedies are largely the same were probably ` +
          `one result, or are two techniques rather than two outputs of one — see ` +
          `parentTechnique.`
        );
      }
    }
  }
  return problems;
}

/**
 * Checks that need the knowledge base, and are therefore opt-in.
 *
 * The skill's central rule is that every identifier comes from a lookup and
 * never from memory, but nothing in the packager can tell whether that rule
 * was followed. Given the compiled knowledge base it can: an id that does not
 * exist is an invention, and a reused mitigation whose text does not match the
 * recorded name is a rename proposed by accident.
 *
 * `kb` is the parsed contents of solve-it.json: objects of techniques,
 * weaknesses and mitigations keyed by id.
 */
export function knowledgeBaseChecks(session, kb) {
  const problems = [];
  const techniques = kb.techniques || {};
  const weaknesses = kb.weaknesses || {};
  const mitigations = kb.mitigations || {};

  const norm = t => (t || '').normalize('NFKC').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  const byName = (corpus) => {
    const m = new Map();
    for (const [id, item] of Object.entries(corpus)) {
      const k = norm(item.name);
      if (k && !m.has(k)) m.set(k, id);
    }
    return m;
  };
  const techniqueByName = byName(techniques);
  const weaknessByName = byName(weaknesses);
  const mitigationByName = byName(mitigations);

  const tId = (session.technique.id || '').trim();
  if (tId && tId !== 'DFT-XXXX' && !techniques[tId]) {
    problems.push(
      `technique.id is ${tId}, which is not in the knowledge base. Leave it as ` +
      `DFT-XXXX for a new technique, or use the id of the one being extended.`
    );
  }

  if (session.technique.parentTechnique && !techniques[session.technique.parentTechnique]) {
    problems.push(
      `parentTechnique ${session.technique.parentTechnique} is not in the knowledge base`
    );
  }

  // Stage 1 is meant to establish the gap is real. Nothing checks the finished
  // draft against the corpus, so a proposal that duplicates an existing entry
  // reaches submission looking new.
  const techHit = techniqueByName.get(norm(session.technique.name));
  // Drafting against an existing technique's id is a supported use of the
  // skill, and there the name matching is the point rather than a problem.
  if (techHit && techHit !== tId) {
    problems.push(
      `the technique name matches ${techHit} ("${techniques[techHit].name}") already in ` +
      `the knowledge base. If this extends that technique, draft against its id ` +
      `rather than DFT-XXXX.`
    );
  }

  for (const [i, w] of session.aggregatedWeaknesses.entries()) {
    const hit = weaknessByName.get(norm(w.name));
    if (hit) {
      problems.push(
        `${label('weakness', i, w.name)} matches ${hit} ("${weaknesses[hit].name}") already ` +
        `in the knowledge base, and will be submitted as a new weakness`
      );
    }
  }

  for (const [i, m] of session.mitigationRefinement.entries()) {
    if (m.existingId) {
      const known = mitigations[m.existingId];
      if (!known) {
        problems.push(
          `${label('mitigation', i, m.name)} reuses ${m.existingId}, which is not in the ` +
          `knowledge base`
        );
      } else if (known.name !== m.name) {
        // The export pairs the id with this text, and nothing in the bundle
        // marks it as a rename.
        problems.push(
          `${label('mitigation', i, m.name)} reuses ${m.existingId} but the text differs ` +
          `from its recorded name, "${known.name}". As written, the submission ` +
          `proposes renaming it everywhere it is used. Copy the recorded name, or ` +
          `clear existingId to propose a new mitigation.`
        );
      }
    } else {
      const hit = mitigationByName.get(norm(m.name));
      if (hit) {
        problems.push(
          `${label('mitigation', i, m.name)} matches ${hit} ("${mitigations[hit].name}") ` +
          `already in the knowledge base. Put ${hit} in existingId and copy its name ` +
          `so the submission reuses it rather than duplicating it.`
        );
      }
    }
    for (const t of m.linkedTechniques || []) {
      if (/^DFT-/.test(t) && !techniques[t]) {
        problems.push(
          `${label('mitigation', i, m.name)} names technique ${t}, which is not in the ` +
          `knowledge base`
        );
      }
    }
  }

  // solve-it.json records citations only where something references them, so
  // an unreferenced but real id looks unknown. Worth reporting, but not as a
  // statement that the id is wrong.
  const citeIds = new Set();
  for (const corpus of [techniques, weaknesses, mitigations]) {
    for (const item of Object.values(corpus)) {
      for (const r of item.references || []) {
        if (r && r.DFCite_id) citeIds.add(r.DFCite_id);
      }
    }
  }
  for (const [where, refs] of allReferences(session)) {
    for (const r of refs) {
      if (r.DFCite_id && !citeIds.has(r.DFCite_id)) {
        problems.push(
          `${where}: ${r.DFCite_id} is not referenced anywhere in the knowledge base. ` +
          `It may still be a real citation that nothing cites yet, so check it ` +
          `rather than assuming it is wrong.`
        );
      }
    }
  }

  return problems;
}

/**
 * The reused mitigation ids whose text matches the name recorded in the
 * knowledge base. Used to soften the reuse note once it has been checked.
 */
export function verifiedMitigationIds(session, kb) {
  const known = kb.mitigations || {};
  const out = new Set();
  for (const m of session.mitigationRefinement) {
    if (m.existingId && known[m.existingId] && known[m.existingId].name === m.name) {
      out.add(m.existingId);
    }
  }
  return out;
}

/** Read the compiled knowledge base from a path or an http(s) URL. */
async function loadKnowledgeBase(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${source} returned ${res.status}`);
    return res.json();
  }
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(source, 'utf8'));
}

/* ── Validating a session against a JSON Schema ─────────────
 *
 * A validator for the subset of JSON Schema the SOLVE-IT schemas use:
 * type, enum, pattern, maxLength, minimum, required, properties,
 * additionalProperties, patternProperties, propertyNames, items, anyOf and
 * $ref. Written by hand because this file has no dependencies and is
 * distributed on its own.
 *
 * A hand-written validator that is subtly wrong is worse than none, because it
 * reports success. So it is not trusted on its own: the helper's test suite
 * runs it against ajv on a corpus of valid and deliberately broken sessions
 * and fails if the two disagree. ajv is the oracle; this is the copy that has
 * to keep up.
 */
export function validateAgainstSchema(data, schema) {
  const root = schema;

  const deref = (node) => {
    let n = node, guard = 0;
    while (n && typeof n.$ref === 'string') {
      if (++guard > 32) return {};
      n = (root.$defs || {})[n.$ref.replace('#/$defs/', '')] || {};
    }
    return n || {};
  };

  const typeOf = (v) =>
    v === null ? 'null'
    : Array.isArray(v) ? 'array'
    : Number.isInteger(v) ? 'integer'
    : typeof v === 'number' ? 'number'
    : typeof v;

  const typeMatches = (v, t) =>
    t === 'integer' ? Number.isInteger(v)
    : t === 'number' ? typeof v === 'number'
    : t === 'array' ? Array.isArray(v)
    : t === 'object' ? (!!v && typeof v === 'object' && !Array.isArray(v))
    : t === 'null' ? v === null
    : typeof v === t;

  /* Errors are collected into the array passed in, so an anyOf branch can be
   * tried in isolation and thrown away without disturbing the real list. */
  const check = (value, node, path, out) => {
    const sch = deref(node);
    if (sch === true || Object.keys(sch).length === 0) return;

    if (sch.anyOf) {
      const matched = sch.anyOf.some(alt => {
        const probe = [];
        check(value, alt, path, probe);
        return probe.length === 0;
      });
      if (!matched) out.push({ path, message: 'matches none of the allowed forms' });
      return;
    }

    if (sch.type && !typeMatches(value, sch.type)) {
      out.push({ path, message: `must be ${sch.type}, but is ${typeOf(value)}` });
      return;   // anything further would be noise
    }
    if (sch.enum && !sch.enum.includes(value)) {
      out.push({ path, message: `"${value}" is not one of: ${sch.enum.join(', ')}` });
    }
    if (typeof value === 'string') {
      if (sch.pattern && !new RegExp(sch.pattern).test(value)) {
        out.push({ path, message: `"${value}" does not match ${sch.pattern}` });
      }
      if (sch.maxLength !== undefined && value.length > sch.maxLength) {
        out.push({ path, message: `is ${value.length} characters, over the limit of ${sch.maxLength}` });
      }
    }
    if (typeof value === 'number' && sch.minimum !== undefined && value < sch.minimum) {
      out.push({ path, message: `is ${value}, below the minimum of ${sch.minimum}` });
    }

    if (Array.isArray(value) && sch.items) {
      value.forEach((v, i) => check(v, sch.items, `${path}[${i}]`, out));
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const r of sch.required || []) {
        if (!(r in value)) out.push({ path: path || '(root)', message: `is missing the required key "${r}"` });
      }
      const props = sch.properties || {};
      const patterns = Object.entries(sch.patternProperties || {});
      for (const [k, v] of Object.entries(value)) {
        const at = path ? `${path}.${k}` : k;
        if (sch.propertyNames) check(k, sch.propertyNames, `${path || '(root)'} key "${k}"`, out);
        if (Object.hasOwn(props, k)) { check(v, props[k], at, out); continue; }
        const byPattern = patterns.find(([re]) => new RegExp(re).test(k));
        if (byPattern) { check(v, byPattern[1], at, out); continue; }
        if (sch.additionalProperties === false) {
          out.push({ path: path || '(root)', message: `has an unrecognised key "${k}"` });
        } else if (sch.additionalProperties && typeof sch.additionalProperties === 'object') {
          check(v, sch.additionalProperties, at, out);
        }
      }
    }
  };

  const errors = [];
  check(data, root, '', errors);
  return errors;
}

/* ── Diagnosing and repairing a session ─────────────────────
 *
 * A session that does not conform is still a session: it holds drafting work
 * that took a person hours. The point of these is that such a file is
 * explained and mended rather than discarded.
 */

const SESSION_SCHEMA_URL = 'https://trwm.hargs.co.uk/session.schema.json';

/**
 * Repair what can be repaired without guessing, and report every change.
 *
 * Only derived and structural values are touched — an index that must equal
 * its position, a hash that is a function of the mitigations, a missing
 * container that has one correct empty form. Nothing that carries meaning is
 * invented, altered or removed: an unrecognised key is kept and reported, not
 * deleted, because the whole purpose is that no drafting work is lost.
 */
export function repairSession(session) {
  const changes = [];
  const unfixable = [];
  const out = JSON.parse(JSON.stringify(session));

  const fillArray = (key) => {
    if (!Array.isArray(out[key])) {
      const was = out[key] === undefined ? 'missing' : 'not an array';
      out[key] = [];
      changes.push(`${key} was ${was}; set to an empty array`);
    }
  };
  for (const k of ['authors', 'results', 'aggregatedWeaknesses', 'mitigationSummary', 'mitigationRefinement']) {
    fillArray(k);
  }
  if (!out.mitigations || typeof out.mitigations !== 'object' || Array.isArray(out.mitigations)) {
    out.mitigations = {};
    changes.push('mitigations was missing or not an object; set to an empty object');
  }
  if (!out.weaknessPrompts || typeof out.weaknessPrompts !== 'object') {
    out.weaknessPrompts = {};
    changes.push('weaknessPrompts was missing; set to an empty object');
  }

  if (out.workflowVariant !== 'TRWM-AC') {
    changes.push(`workflowVariant was ${JSON.stringify(out.workflowVariant)}; set to "TRWM-AC"`);
    out.workflowVariant = 'TRWM-AC';
  }
  if (typeof out.version !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(out.version)) {
    changes.push(`version was ${JSON.stringify(out.version)}; set to ${TARGET_APP_VERSION}`);
    out.version = TARGET_APP_VERSION;
  }
  for (const k of ['created', 'modified']) {
    if (typeof out[k] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(out[k])) {
      const d = today();
      changes.push(`${k} was ${JSON.stringify(out[k])}; set to ${d}`);
      out[k] = d;
    }
  }
  if (typeof out.sessionName !== 'string' || !out.sessionName.trim()) {
    const name = (out.technique && out.technique.name) || 'Recovered session';
    changes.push(`sessionName was empty; set to ${JSON.stringify(name)}`);
    out.sessionName = name;
  }

  // index must equal position; it is derived, so correcting it loses nothing.
  out.aggregatedWeaknesses.forEach((w, i) => {
    if (w && w.index !== i) {
      changes.push(`aggregatedWeaknesses[${i}].index was ${w.index}; set to ${i}`);
      w.index = i;
    }
  });
  out.mitigationRefinement.forEach((m, i) => {
    if (m && m.index !== i) {
      changes.push(`mitigationRefinement[${i}].index was ${m.index}; set to ${i}`);
      m.index = i;
    }
  });

  const hash = mitigationDataHash(out.mitigations);
  if (out.lastMitAggregationHash !== hash) {
    changes.push(`lastMitAggregationHash was ${JSON.stringify(out.lastMitAggregationHash)}; recomputed as ${hash}`);
    out.lastMitAggregationHash = hash;
  }

  // Things that carry meaning and must not be guessed at.
  for (const k of Object.keys(out)) {
    if (!ALLOWED_KEYS.includes(k)) {
      unfixable.push(
        `"${k}" is not a key the helper accepts. It is kept in the repaired file so nothing ` +
        `is lost, but the application will drop it on import. Move anything you need into a ` +
        `key that is accepted.`
      );
    }
  }
  const count = out.aggregatedWeaknesses.length;
  for (const k of Object.keys(out.mitigations)) {
    if (!/^[0-9]+$/.test(k)) {
      unfixable.push(`mitigations is keyed by "${k}"; keys are weakness indices and cannot be guessed`);
    } else if (Number(k) >= count) {
      unfixable.push(
        `mitigations has key ${k} but there are ${count} weaknesses. Which weakness those ` +
        `mitigations belong to cannot be worked out from the file.`
      );
    }
  }

  return { session: out, changes, unfixable };
}

/** Read a JSON Schema from a path or an http(s) URL. */
async function loadSchema(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${source} returned ${res.status}`);
    return res.json();
  }
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(source, 'utf8'));
}

/* ── CLI ───────────────────────────────────────────────────── */

async function main(argv) {
  const args = argv.slice(2);
  const arg = (name) => {
    const i = args.indexOf(name);
    return i !== -1 ? args[i + 1] : null;
  };

  // --check and --repair take a session file, not a draft. They exist so a
  // session that does not conform is explained and mended rather than thrown
  // away: it holds work that took a person hours.
  const checkPath = arg('--check');
  const repairPath = arg('--repair');
  if (checkPath || repairPath) {
    const { readFile, writeFile } = await import('node:fs/promises');
    const path = checkPath || repairPath;
    let session;
    try {
      session = JSON.parse(await readFile(path, 'utf8'));
    } catch (err) {
      process.stderr.write(`could not read ${path}: ${err.message}\n`);
      process.exit(1);
    }

    let subject = session;
    if (repairPath) {
      const { session: fixed, changes, unfixable } = repairSession(session);
      subject = fixed;
      for (const c of changes) process.stderr.write(`fixed: ${c}\n`);
      for (const u of unfixable) process.stderr.write(`manual: ${u}\n`);
      if (!changes.length) process.stderr.write('nothing needed repairing\n');
      const out = arg('--out');
      if (out) {
        await writeFile(out, JSON.stringify(fixed, null, 2) + '\n', 'utf8');
        process.stderr.write(`wrote ${out}\n`);
      } else {
        process.stdout.write(JSON.stringify(fixed, null, 2) + '\n');
      }
    }

    // Structural checks always; the schema when one can be reached. A schema
    // that cannot be loaded is reported, never skipped silently: a run that
    // checked nothing must not look like a run that passed.
    let problems = [];
    try {
      problems = selfCheck(subject);
    } catch (err) {
      process.stderr.write(`check: the file is too malformed to check structurally — ${err.message}\n`);
      process.exit(1);
    }
    for (const p of problems) process.stderr.write(`check: ${p}\n`);

    const schemaSource = arg('--session-schema') || SESSION_SCHEMA_URL;
    try {
      const errs = validateAgainstSchema(subject, await loadSchema(schemaSource));
      for (const e of errs) {
        process.stderr.write(`schema: ${e.path || '(root)'} ${e.message}\n`);
      }
      process.stderr.write(
        `checked against ${schemaSource} — ${errs.length} schema problem(s), ` +
        `${problems.length} structural\n`
      );
      if (errs.length || problems.length) process.exit(1);
    } catch (err) {
      process.stderr.write(
        `schema: could not load ${schemaSource} — ${err.message}. ` +
        `The structural checks above ran; the schema check did not.\n`
      );
      process.exit(1);
    }
    return;
  }

  if (args.includes('--schema')) {
    process.stdout.write(JSON.stringify(buildDraftSchema(), null, 2) + '\n');
    return;
  }
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(
      `trwm-draft-submission ${SKILL_VERSION} ` +
      `(targets TRWM SOLVE-IT Helper ${TARGET_APP_VERSION})\n`
    );
    return;
  }
  // Positional arguments are those not consumed as a flag or a flag's value.
  const FLAGS_WITH_VALUES = ['--out', '--date', '--kb', '--session-schema', '--check', '--repair'];
  const positional = args.filter((a, i) => {
    if (a.startsWith('-')) return false;
    const prev = args[i - 1];
    return !(prev && FLAGS_WITH_VALUES.includes(prev));
  });
  const inputPath = positional[0];
  if (!inputPath) {
    process.stderr.write(
      'usage: node package_session.mjs <draft.json> [--out <session.json>]\n' +
      '                                [--kb <solve-it.json | url>] [--strict]\n' +
      '       node package_session.mjs --check <session.json>\n' +
      '       node package_session.mjs --repair <session.json> [--out <fixed.json>]\n' +
      '\n' +
      '  --check   diagnose a session file: structural problems and any way it\n' +
      '            departs from the published schema, each with its path.\n' +
      '  --repair  mend what can be mended without guessing — derived indices,\n' +
      '            a stale hash, a missing container — and report every change.\n' +
      '            Nothing that carries meaning is invented or removed, so an\n' +
      '            unrecognised key is kept and reported rather than dropped.\n' +
      '  --session-schema <path|url>\n' +
      '            where to read the session schema from. Defaults to\n' +
      '            https://trwm.hargs.co.uk/session.schema.json\n' +
      '\n' +
      '  --kb      also run the checks that need the knowledge base:\n' +
      '            that every id exists, and that a reused mitigation keeps\n' +
      '            its recorded name. Accepts a local path or a URL, e.g.\n' +
      '            https://data.solveit-df.org/solve-it.json\n' +
      '  --strict  exit 1 if any check is reported. Off by default, because\n' +
      '            most checks are for a person to judge, not errors.\n' +
      '  --version print the skill version and the helper version it targets.\n' +
      '  --schema  print the draft format as a JSON Schema, to stdout.\n' +
      '  --date    fix created/modified, so a run is reproducible. Used by the\n' +
      '            tests; rarely wanted otherwise.\n');
    process.exit(2);
  }
  const outIdx = args.indexOf('--out');
  const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
  // --date fixes created/modified, so a run is reproducible. Used by the
  // regression test; rarely wanted otherwise.
  const dateIdx = args.indexOf('--date');
  const date = dateIdx !== -1 ? args[dateIdx + 1] : null;
  // --kb runs the checks that need the knowledge base. Off by default, so an
  // ordinary run stays offline, dependency-free and reproducible.
  const kbIdx = args.indexOf('--kb');
  const kbSource = kbIdx !== -1 ? args[kbIdx + 1] : null;
  // Without this, `--kb` as the last argument skips every knowledge base check
  // and exits 0 — the exact outcome the hard error on an unreadable --kb
  // exists to prevent.
  if (kbIdx !== -1 && (!kbSource || kbSource.startsWith('-'))) {
    process.stderr.write('--kb needs a path or a URL after it\n');
    process.exit(2);
  }
  // --strict makes any check a failure. Interactive runs want the opposite:
  // most checks are omissions for a person to judge, not errors.
  const strict = args.includes('--strict');

  const { readFile, writeFile } = await import('node:fs/promises');
  let draft;
  try {
    draft = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`could not read ${inputPath}: ${err.message}\n`);
    process.exit(1);
  }

  let session;
  try {
    session = packageSession(draft, date ? { date } : {});
  } catch (err) {
    if (err instanceof DraftError) {
      process.stderr.write(`draft problem: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const problems = [...selfCheck(session), ...draftingChecks(session)];
  let verified = new Set();
  if (kbSource) {
    try {
      const kb = await loadKnowledgeBase(kbSource);
      problems.push(...knowledgeBaseChecks(session, kb));
      verified = verifiedMitigationIds(session, kb);
    } catch (err) {
      // A knowledge base that cannot be read is reported rather than ignored:
      // a run that silently skipped these checks would look like a run that
      // passed them.
      process.stderr.write(`could not read the knowledge base at ${kbSource}: ${err.message}\n`);
      process.exit(1);
    }
  }
  for (const p of problems) process.stderr.write(`check: ${p}\n`);
  for (const n of notes(session, verified)) process.stderr.write(`note: ${n}\n`);

  const text = JSON.stringify(session, null, 2);
  if (outPath) {
    await writeFile(outPath, text + '\n', 'utf8');
    process.stderr.write(
      `wrote ${outPath} — ${session.aggregatedWeaknesses.length} weaknesses, ` +
      `${session.mitigationRefinement.length} unique mitigations ` +
      `(skill ${SKILL_VERSION}, targets helper ${TARGET_APP_VERSION})\n`
    );
  } else {
    process.stdout.write(text + '\n');
  }

  if (strict && problems.length) {
    process.stderr.write(`${problems.length} check(s) reported, and --strict was given\n`);
    process.exit(1);
  }
}

/**
 * Was this file run as a command, rather than imported?
 *
 * Compare resolved real paths. import.meta.url is already the real path, so a
 * naive comparison against process.argv[1] fails whenever the script is
 * reached through a symlink — which is the normal case, because the skill is
 * usually symlinked into a .claude/skills directory rather than copied. The
 * failure is silent: main() never runs and the process exits 0 having done
 * nothing. pathToFileURL also handles paths containing spaces, which plain
 * string interpolation does not.
 */
function invokedAsCommand() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (invokedAsCommand()) {
  main(process.argv).catch(err => {
    process.stderr.write(String(err.stack || err) + '\n');
    process.exit(1);
  });
}
