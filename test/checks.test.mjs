// Tests for the checks added in 1.5.0.
//
// Two groups. The first needs nothing but the packager. The second runs the
// checks that need the knowledge base, against a small fixture rather than the
// live endpoint, so the suite stays offline and does not change meaning when
// the knowledge base is rebuilt.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const SKILL_DIR = join(process.cwd(), 'skills', 'trwm-draft-submission');
const PACKAGER = join(SKILL_DIR, 'package_session.mjs');
const DRAFT_PATH = join(SKILL_DIR, 'references', 'example-draft.json');

/** Run the packager, returning its checks, notes and exit status. */
function run(draftPath = DRAFT_PATH, extraArgs = []) {
  const out = join(mkdtempSync(join(tmpdir(), 'trwm-checks-')), 'session.json');
  const r = spawnSync(
    process.execPath,
    [PACKAGER, draftPath, '--out', out, '--date', '2026-01-01', ...extraArgs],
    { encoding: 'utf8' }
  );
  const lines = String(r.stderr).split('\n');
  return {
    status: r.status,
    stderr: String(r.stderr),
    checks: lines.filter(l => l.startsWith('check: ')).map(l => l.slice(7)),
    notes: lines.filter(l => l.startsWith('note: ')).map(l => l.slice(6)),
  };
}

function withDraft(mutate) {
  const draft = JSON.parse(readFileSync(DRAFT_PATH, 'utf8'));
  mutate(draft);
  const p = join(mkdtempSync(join(tmpdir(), 'trwm-checks-draft-')), 'draft.json');
  writeFileSync(p, JSON.stringify(draft), 'utf8');
  return p;
}

/** Every mitigation object in a draft, wherever it hangs. */
function eachMitigation(draft, fn) {
  for (const w of draft.weaknesses) {
    for (const c of w.causes || []) {
      for (const m of c.mitigations || []) fn(m);
    }
  }
}

describe('checks that need nothing but the draft', () => {
  test('the shipped example still reports nothing', () => {
    // Every check below has to be quiet on correct input, or it is noise.
    assert.deepEqual(run().checks, []);
  });

  test('two causes reducing to the same weakness are reported', () => {
    // The application merges them and combines their mitigations, so without
    // this the drafter loses a cause with nothing on screen to say so.
    const p = withDraft(d => {
      const w = d.weaknesses[0];
      w.causes.push(JSON.parse(JSON.stringify(w.causes[0])));
    });
    const hit = run(p).checks.filter(c => /reduce to the same weakness/.test(c));
    assert.equal(hit.length, 1);
    assert.match(hit[0], /2 causes under DFTR1 \/ ASTM_INCOMP/);
    assert.match(hit[0], /1 of them will be lost/);
  });

  test('the same weakness under different results is not reported as a duplicate', () => {
    // Merging across results is the intended behaviour, not a duplicate.
    assert.deepEqual(
      run().checks.filter(c => /reduce to the same weakness/.test(c)),
      []
    );
  });

  test('a cause that does not begin with its effect is reported', () => {
    const p = withDraft(d => {
      d.weaknesses[0].causes[0].text = 'Per-user associations were not examined';
    });
    assert.ok(run(p).checks.some(c => /the cause does not begin with its effect/.test(c)));
  });

  test('two mitigations differing only in punctuation are reported', () => {
    const p = withDraft(d => {
      const first = d.weaknesses[0].causes[0].mitigations[0];
      d.weaknesses[0].causes[1].mitigations.push({
        text: `${first.text}.`, existingId: '', description: '',
      });
    });
    assert.ok(run(p).checks.some(c => /differ only in punctuation or spacing/.test(c)));
  });

  test('a malformed parentTechnique is reported', () => {
    const p = withDraft(d => { d.technique.parentTechnique = 'DFT1052'; });
    assert.ok(run(p).checks.some(c => /parentTechnique is "DFT1052"/.test(c)));
  });

  test('a malformed existingId is reported', () => {
    const p = withDraft(d => {
      eachMitigation(d, m => { if (m.existingId) m.existingId = 'DFM1027'; });
    });
    assert.ok(run(p).checks.some(c => /not a mitigation id of the form DFM-1234/.test(c)));
  });

  test('a malformed linked technique is reported', () => {
    const p = withDraft(d => {
      d.mitigationDetails = d.mitigationDetails || [];
      d.mitigationDetails[0] = { ...d.mitigationDetails[0], technique: 'DFT_1052' };
    });
    assert.ok(run(p).checks.some(c => /not a technique id of the form DFT-1234/.test(c)));
  });
});

describe('unrecognised draft keys', () => {
  // A misspelt key is not read, so whatever it holds is dropped and the run
  // reports success. Every case below packaged cleanly before this check.
  test('a misspelt cause list is refused, and names the intended key', () => {
    const p = withDraft(d => {
      const w = d.weaknesses[0];
      w.cause = w.causes; delete w.causes;
    });
    const r = run(p);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /weaknesses\[0\] has an unrecognised key "cause"/);
    assert.match(r.stderr, /Did you mean "causes"\?/);
  });

  test('a misspelt optional key at the root is refused', () => {
    // The worst case: mitigationDetails carried descriptions, references and
    // linked techniques, and misspelling it lost all of them silently.
    const p = withDraft(d => {
      d.mitigationDetail = d.mitigationDetails; delete d.mitigationDetails;
    });
    const r = run(p);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Did you mean "mitigationDetails"\?/);
  });

  test('a misspelt key deep in the draft names its full path', () => {
    const p = withDraft(d => {
      const c = d.weaknesses[0].causes[0];
      c.mitigation = c.mitigations; delete c.mitigations;
    });
    assert.match(run(p).stderr, /weaknesses\[0\]\.causes\[0\] has an unrecognised key "mitigation"/);
  });

  test('a key with no near match lists what is allowed instead', () => {
    const p = withDraft(d => { d.weaknesses[0].likelihood = 'high'; });
    const r = run(p);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unrecognised key "likelihood"/);
    assert.match(r.stderr, /Allowed here: result, errorClasses, effect/);
    assert.doesNotMatch(r.stderr, /Did you mean/);
  });

  test('underscore-prefixed keys are comments and are allowed', () => {
    // The shipped example carries _note, so this is not hypothetical.
    const p = withDraft(d => {
      d._scratch = 'x';
      d.technique._todo = 'check this';
      d.weaknesses[0]._why = 'drafting comment';
    });
    assert.equal(run(p).status, 0);
  });

  test('the shipped example uses only recognised keys', () => {
    assert.equal(run().status, 0);
  });
});

describe('the generated schema', () => {
  const SCHEMA_PATH = join(SKILL_DIR, 'references', 'draft.schema.json');

  function generated() {
    const r = spawnSync(process.execPath, [PACKAGER, '--schema'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`--schema exited ${r.status}: ${r.stderr}`);
    return r.stdout;
  }

  test('the checked-in schema matches what the code generates', () => {
    // The schema is emitted from DRAFT_SPEC so the two cannot describe
    // different formats. This is what stops the file going stale after an
    // edit to the spec. Regenerate with `npm run schema`.
    assert.equal(
      readFileSync(SCHEMA_PATH, 'utf8'),
      generated(),
      'references/draft.schema.json is out of date — run `npm run schema`'
    );
  });

  test('every $ref resolves to a definition that exists', () => {
    const schema = JSON.parse(generated());
    const defs = new Set(Object.keys(schema.$defs));
    const refs = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (typeof node.$ref === 'string') refs.push(node.$ref);
      for (const v of Object.values(node)) walk(v);
    })(schema);
    assert.ok(refs.length > 0, 'the schema uses $refs');
    for (const r of refs) {
      const name = r.replace('#/$defs/', '');
      assert.ok(defs.has(name), `$ref ${r} has no definition`);
    }
  });

  test('every level rejects unknown keys and allows underscore comments', () => {
    const schema = JSON.parse(generated());
    for (const [name, def] of [['(root)', schema], ...Object.entries(schema.$defs)]) {
      if (name === 'reference') continue;   // a union with a bare string
      assert.equal(def.additionalProperties, false, `${name} allows unknown keys`);
      assert.deepEqual(def.patternProperties, { '^_': true }, `${name} rejects comments`);
    }
  });

  test('the error class enum matches the codes the packager uses', () => {
    const schema = JSON.parse(generated());
    assert.deepEqual(
      schema.$defs.weaknesses.properties.errorClasses.items.enum,
      ['ASTM_INCOMP', 'ASTM_INAC_EX', 'ASTM_INAC_AS',
       'ASTM_INAC_ALT', 'ASTM_INAC_COR', 'ASTM_MISINT']
    );
  });
});

describe('value types', () => {
  test('a string where an array belongs is refused', () => {
    const p = withDraft(d => { d.technique.synonyms = 'one, two'; });
    const r = run(p);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /technique\.synonyms must be an array of strings, but is string/);
  });

  test('an array where a string belongs is refused', () => {
    const p = withDraft(d => { d.technique.name = ['Extract file type associations']; });
    assert.match(run(p).stderr, /technique\.name must be a string, but is an array/);
  });

  test('an object where an array of objects belongs is refused', () => {
    const p = withDraft(d => { d.weaknesses[0].causes = d.weaknesses[0].causes[0]; });
    assert.match(run(p).stderr, /weaknesses\[0\]\.causes must be an array of objects/);
  });
});

const SESSION_SCHEMA_PATH = join(process.cwd(), '..', 'trwm-solveit-helper', 'session.schema.json');

describe('--check and --repair', () => {
  const SESSION_SCHEMA = join(process.cwd(), '..', 'trwm-solveit-helper', 'session.schema.json');
  const haveSchema = existsSync(SESSION_SCHEMA);

  function packaged() {
    const out = join(mkdtempSync(join(tmpdir(), 'trwm-diag-')), 'session.json');
    const r = spawnSync(process.execPath,
      [PACKAGER, DRAFT_PATH, '--out', out, '--date', '2026-01-01'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return { path: out, session: JSON.parse(readFileSync(out, 'utf8')) };
  }

  function write(session) {
    const p = join(mkdtempSync(join(tmpdir(), 'trwm-diag-in-')), 'session.json');
    writeFileSync(p, JSON.stringify(session, null, 2), 'utf8');
    return p;
  }

  function diag(args) {
    const r = spawnSync(process.execPath, [PACKAGER, ...args], { encoding: 'utf8' });
    const lines = String(r.stderr).split('\n');
    return {
      status: r.status,
      stderr: String(r.stderr),
      checks: lines.filter(l => l.startsWith('check: ')).map(l => l.slice(7)),
      schema: lines.filter(l => l.startsWith('schema: ')).map(l => l.slice(8)),
      fixed: lines.filter(l => l.startsWith('fixed: ')).map(l => l.slice(7)),
      manual: lines.filter(l => l.startsWith('manual: ')).map(l => l.slice(8)),
    };
  }

  const schemaArgs = () => haveSchema ? ['--session-schema', SESSION_SCHEMA] : [];

  test('a freshly packaged session passes its own check', { skip: !haveSchema && 'no sibling helper checkout' }, () => {
    const { path } = packaged();
    const r = diag(['--check', path, ...schemaArgs()]);
    assert.deepEqual(r.checks, []);
    assert.deepEqual(r.schema, []);
    assert.equal(r.status, 0);
  });

  test('a damaged session is diagnosed, not merely rejected', { skip: !haveSchema && 'no sibling helper checkout' }, () => {
    const { session } = packaged();
    session.aggregatedWeaknesses[0].index = 99;
    session.workflowVariant = 'TRWM-A';
    session.results[0].id = 'RESULT1';
    session.draftingNotes = 'hours of work nobody should lose';
    const r = diag(['--check', write(session), ...schemaArgs()]);
    assert.equal(r.status, 1);
    assert.ok(r.checks.some(c => /index is 99/.test(c)));
    assert.ok(r.checks.some(c => /workflowVariant is "TRWM-A"/.test(c)));
    assert.ok(r.checks.some(c => /not of the form DFTR1/.test(c)));
    // The schema permits extra keys because the app drops them; that dropping
    // is exactly why a diagnostic has to mention it.
    assert.ok(r.checks.some(c => /"draftingNotes".*dropped on import/.test(c)));
  });

  test('repair mends what is derived and refuses to guess the rest', () => {
    const { session } = packaged();
    session.aggregatedWeaknesses[0].index = 99;
    session.lastMitAggregationHash = '0';
    session.workflowVariant = 'TRWM-A';
    session.created = 'not-a-date';
    delete session.mitigationSummary;
    session.mitigations['99'] = session.mitigations['0'];

    const out = join(mkdtempSync(join(tmpdir(), 'trwm-fix-')), 'fixed.json');
    const r = diag(['--repair', write(session), '--out', out]);
    assert.ok(r.fixed.some(c => /index was 99; set to 0/.test(c)));
    assert.ok(r.fixed.some(c => /lastMitAggregationHash was "0"; recomputed/.test(c)));
    assert.ok(r.fixed.some(c => /workflowVariant was "TRWM-A"/.test(c)));
    assert.ok(r.fixed.some(c => /created was "not-a-date"/.test(c)));
    assert.ok(r.fixed.some(c => /mitigationSummary/.test(c)));
    // Which weakness an out-of-range mitigation belongs to cannot be derived.
    assert.ok(r.manual.some(c => /cannot be worked out from the file/.test(c)));
  });

  test('repair loses nothing, including keys the helper will drop', () => {
    // The whole point: a non-conforming session still holds hours of work.
    const { session } = packaged();
    session.draftingNotes = 'hours of work nobody should lose';
    session.aggregatedWeaknesses[0].index = 99;
    const before = write(session);

    const out = join(mkdtempSync(join(tmpdir(), 'trwm-fix2-')), 'fixed.json');
    diag(['--repair', before, '--out', out]);
    const after = JSON.parse(readFileSync(out, 'utf8'));

    assert.equal(after.draftingNotes, 'hours of work nobody should lose');
    assert.equal(after.aggregatedWeaknesses.length, session.aggregatedWeaknesses.length);
    assert.equal(after.mitigationRefinement.length, session.mitigationRefinement.length);
    assert.equal(after.rationale, session.rationale);

    const paths = (o, p = '') => {
      const out = new Set();
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        for (const [k, v] of Object.entries(o)) { out.add(`${p}.${k}`); for (const x of paths(v, `${p}.${k}`)) out.add(x); }
      } else if (Array.isArray(o)) {
        o.forEach((v, i) => { for (const x of paths(v, `${p}[${i}]`)) out.add(x); });
      }
      return out;
    };
    const lost = [...paths(session)].filter(x => !paths(after).has(x));
    assert.deepEqual(lost, [], `paths lost in repair: ${lost.join(', ')}`);
  });

  test('a schema that cannot be loaded is an error, not a silent skip', () => {
    const { path } = packaged();
    const r = diag(['--check', path, '--session-schema', '/no/such/schema.json']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /the schema check did not/);
  });
});

describe('regressions found by review', () => {
  // Each of these packaged cleanly, or crashed, before it was fixed.

  test('weakness-level fields alongside causes are refused, not dropped', () => {
    // They were read only when a weakness had no causes, so with causes they
    // vanished with no check and no note.
    for (const key of ['mitigations', 'description', 'references']) {
      const p = withDraft(d => {
        d.weaknesses[0][key] = key === 'description'
          ? 'WEAKNESS LEVEL'
          : [key === 'mitigations' ? { text: 'WEAKNESS LEVEL' } : { DFCite_id: 'DFCite-1060' }];
      });
      const r = run(p);
      assert.equal(r.status, 1, `${key} was accepted`);
      assert.match(r.stderr, new RegExp(`has both causes and its own "${key}"`));
    }
  });

  test('a weakness with no causes still uses its own mitigations', () => {
    // The shipped example has one, so this is the path the refusal must spare.
    const s = JSON.parse(readFileSync(DRAFT_PATH, 'utf8'));
    assert.ok(s.weaknesses.some(w => !(w.causes || []).length), 'example has a no-cause weakness');
    assert.equal(run().status, 0);
  });

  test('repair survives a damaged mitigation map instead of crashing', () => {
    // --repair is handed exactly the malformed files it exists to mend, so
    // nothing in its path may assume a well-formed shape.
    const cases = {
      'a null entry': { '0': [null, { text: 'm' }] },
      'not an array': { '0': { text: 'm' } },
      'a string':     { '0': 'mitigation' },
    };
    for (const [name, mitigations] of Object.entries(cases)) {
      const p = join(mkdtempSync(join(tmpdir(), 'trwm-null-')), 'session.json');
      writeFileSync(p, JSON.stringify({ technique: { name: 'x' }, mitigations }), 'utf8');
      const out = join(mkdtempSync(join(tmpdir(), 'trwm-null-out-')), 'fixed.json');
      const r = spawnSync(process.execPath, [PACKAGER, '--repair', p, '--out', out], { encoding: 'utf8' });
      assert.doesNotMatch(String(r.stderr), /TypeError/, `crashed on ${name}`);
      assert.match(String(r.stderr), /fixed:/, `reported nothing for ${name}`);
    }
  });

  test('an absent optional container does not abandon every structural check', () => {
    // It threw, so --check reported nothing at all about the file.
    const out = join(mkdtempSync(join(tmpdir(), 'trwm-opt-')), 'session.json');
    const built = spawnSync(process.execPath,
      [PACKAGER, DRAFT_PATH, '--out', out, '--date', '2026-01-01'], { encoding: 'utf8' });
    assert.equal(built.status, 0, built.stderr);
    const session = JSON.parse(readFileSync(out, 'utf8'));
    delete session.results[0].ontologyOutputClasses;
    delete session.technique.synonyms;
    const p = join(mkdtempSync(join(tmpdir(), 'trwm-opt2-')), 'session.json');
    writeFileSync(p, JSON.stringify(session), 'utf8');
    const r = spawnSync(process.execPath, [PACKAGER, '--check', p, '--session-schema', SESSION_SCHEMA_PATH], { encoding: 'utf8' });
    assert.doesNotMatch(String(r.stderr), /too malformed to check structurally/);
    assert.match(String(r.stderr), /has no CASE output class/);
  });

  test('a flag value is not mistaken for the draft path', () => {
    const kb = join(mkdtempSync(join(tmpdir(), 'trwm-flag-')), 'kb.json');
    writeFileSync(kb, JSON.stringify({ techniques: {}, weaknesses: {}, mitigations: {} }), 'utf8');
    const r = spawnSync(process.execPath,
      [PACKAGER, '--kb', kb, DRAFT_PATH, '--out', '/dev/null'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(String(r.stderr), /wrote/);
  });

  test('--kb with no value is a usage error, not a silent skip', () => {
    const r = spawnSync(process.execPath,
      [PACKAGER, DRAFT_PATH, '--out', '/dev/null', '--kb'], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(String(r.stderr), /--kb needs a path or a URL/);
  });

  test('a mitigationDetails entry matching nothing is reported', () => {
    const p = withDraft(d => { d.mitigationDetails[0].text += '.'; });
    assert.ok(run(p).checks.some(c => /matches no mitigation/.test(c)));
  });

  test('a malformed technique.id is reported', () => {
    const p = withDraft(d => { d.technique.id = 'DFT_9999_bogus'; });
    const r = run(p);
    assert.ok(r.checks.some(c => /technique\.id is "DFT_9999_bogus"/.test(c)));
    assert.equal(run(p, ['--strict']).status, 1);
  });

  test('DFT-XXXX is not reported as a malformed id', () => {
    assert.deepEqual(run().checks, []);
  });

  test('a prototype key does not slip past the unrecognised-key rejection', () => {
    for (const key of ['constructor', 'toString', 'hasOwnProperty']) {
      const p = withDraft(d => { d.weaknesses[0][key] = { sneaky: 1 }; });
      const r = run(p);
      assert.equal(r.status, 1, `${key} was accepted`);
      assert.match(r.stderr, new RegExp(`unrecognised key "${key}"`));
    }
  });

  test('a missing array is reported as missing, not as "not an array"', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'trwm-miss-')), 'session.json');
    writeFileSync(out, JSON.stringify({ technique: { name: 'x' } }), 'utf8');
    const r = spawnSync(process.execPath, [PACKAGER, '--repair', out, '--out', '/dev/null'], { encoding: 'utf8' });
    assert.match(String(r.stderr), /authors was missing; set to an empty array/);
  });
});

describe('--strict', () => {
  test('a clean draft exits 0', () => {
    assert.equal(run(DRAFT_PATH, ['--strict']).status, 0);
  });

  test('a draft with a check exits 1', () => {
    const p = withDraft(d => { d.technique.parentTechnique = 'DFT1052'; });
    assert.equal(run(p, ['--strict']).status, 1);
  });

  test('without --strict the same draft still exits 0', () => {
    const p = withDraft(d => { d.technique.parentTechnique = 'DFT1052'; });
    assert.equal(run(p).status, 0);
  });
});

describe('checks that need the knowledge base', () => {
  // A fixture rather than the live endpoint: these tests are about the checks,
  // not about what the knowledge base happens to contain today.
  const KB = {
    techniques: {
      // DFCite-1060 is referenced here because solve-it.json records a
      // citation only where something cites it, and the example draft uses it.
      'DFT-1001': {
        id: 'DFT-1001', name: 'Triage devices or media',
        references: [{ DFCite_id: 'DFCite-1060', relevance_summary_280: '' }],
      },
      'DFT-1052': { id: 'DFT-1052', name: 'Extract file system metadata', references: [] },
    },
    weaknesses: {
      'DFW-1001': { id: 'DFW-1001', name: 'Triage results are incomplete', references: [] },
    },
    mitigations: {
      'DFM-1001': { id: 'DFM-1001', name: 'Review of all triage results', references: [] },
      'DFM-1027': { id: 'DFM-1027', name: 'Use dual tool verification', references: [] },
    },
  };

  function withKb(mutate = () => {}) {
    const kb = JSON.parse(JSON.stringify(KB));
    mutate(kb);
    const p = join(mkdtempSync(join(tmpdir(), 'trwm-checks-kb-')), 'kb.json');
    writeFileSync(p, JSON.stringify(kb), 'utf8');
    return p;
  }

  test('the shipped example passes against a knowledge base holding its ids', () => {
    assert.deepEqual(run(DRAFT_PATH, ['--kb', withKb()]).checks, []);
  });

  test('a reused mitigation whose text differs from the recorded name is reported', () => {
    // The export pairs the id with this text, and nothing in the bundle marks
    // it as a rename, so this is the check with the least visible failure.
    const p = withDraft(d => {
      eachMitigation(d, m => {
        if (m.existingId === 'DFM-1027') m.text = 'Use dual-tool verification';
      });
    });
    const hit = run(p, ['--kb', withKb()]).checks.filter(c => /proposes renaming/.test(c));
    assert.equal(hit.length, 1);
    assert.match(hit[0], /DFM-1027/);
    assert.match(hit[0], /"Use dual tool verification"/);
  });

  test('an identifier that is not in the knowledge base is reported', () => {
    const p = withDraft(d => {
      eachMitigation(d, m => { if (m.existingId) m.existingId = 'DFM-9999'; });
    });
    assert.ok(run(p, ['--kb', withKb()]).checks
      .some(c => /DFM-9999, which is not in the knowledge base/.test(c)));
  });

  test('a new mitigation duplicating an existing name is reported', () => {
    const p = withDraft(d => {
      d.weaknesses[0].causes[0].mitigations[0] = {
        text: 'Review of all triage results', existingId: '', description: '',
      };
    });
    assert.ok(run(p, ['--kb', withKb()]).checks
      .some(c => /Put DFM-1001 in existingId/.test(c)));
  });

  test('a technique name that already exists is reported', () => {
    const p = withDraft(d => { d.technique.name = 'Triage devices or media'; });
    assert.ok(run(p, ['--kb', withKb()]).checks
      .some(c => /matches DFT-1001 .* already in/.test(c)));
  });

  test('a parentTechnique that does not exist is reported', () => {
    const p = withDraft(d => { d.technique.parentTechnique = 'DFT-9999'; });
    assert.ok(run(p, ['--kb', withKb()]).checks
      .some(c => /parentTechnique DFT-9999 is not in the knowledge base/.test(c)));
  });

  test('an unreferenced DFCite id is reported as something to check, not as wrong', () => {
    // A citation appears in solve-it.json only where something cites it, so an
    // id that is real but unreferenced looks unknown. The wording has to say
    // so, or the check asserts something it cannot know.
    const kb = withKb(k => { k.techniques['DFT-1001'].references = []; });
    const hit = run(DRAFT_PATH, ['--kb', kb]).checks.filter(c => /DFCite-1060/.test(c));
    assert.equal(hit.length, 1);
    assert.match(hit[0], /may still be a real citation/);
    assert.match(hit[0], /check it rather than assuming it is wrong/);
    // It must not assert the id is invalid, which is the thing it cannot know.
    assert.doesNotMatch(hit[0], /does not exist|is not a valid|invalid/);
  });

  test('an unreadable knowledge base fails rather than skipping the checks', () => {
    // A run that silently skipped these would look like a run that passed them.
    const r = run(DRAFT_PATH, ['--kb', '/no/such/knowledge-base.json']);
    assert.equal(r.status, 1);
  });

  test('the reuse note stops asking for a check the knowledge base has made', () => {
    const withoutKb = run().notes.find(n => /reuses DFM-1027/.test(n));
    const withKbNote = run(DRAFT_PATH, ['--kb', withKb()]).notes.find(n => /reuses DFM-1027/.test(n));
    assert.match(withoutKb, /confirm this matches the name/);
    assert.match(withKbNote, /which matches its name in the knowledge base/);
  });
});
