// Tests for package_session.mjs, the packager the skill ships.
//
// These run the packager as a command, the way the skill runs it, and inspect
// what it writes and what it reports. Nothing here needs the TRWM SOLVE-IT
// Helper: the tests that load a packaged session into the running application
// and check that its own aggregation is a no-op on it live with the
// application, because their purpose is to detect the application drifting
// away from this packager.
//
// Run with `npm test`, which is `node --test`. No dependencies.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const SKILL_DIR = join(process.cwd(), 'skills', 'trwm-draft-submission');
const PACKAGER = join(SKILL_DIR, 'package_session.mjs');
const DRAFT_PATH = join(SKILL_DIR, 'references', 'example-draft.json');

/**
 * Run the packager the way the skill runs it — as a command — and return the
 * session together with the self-check lines it reported. A fixed date keeps
 * the output reproducible.
 */
function runPackager(draftPath = DRAFT_PATH) {
  const out = join(mkdtempSync(join(tmpdir(), 'trwm-skill-')), 'session.json');
  const r = spawnSync(
    process.execPath,
    [PACKAGER, draftPath, '--out', out, '--date', '2026-01-01'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(`packager exited ${r.status}: ${r.stderr || r.stdout}`);
  }
  return {
    session: JSON.parse(readFileSync(out, 'utf8')),
    checks: String(r.stderr)
      .split('\n')
      .filter(l => l.startsWith('check: '))
      .map(l => l.slice('check: '.length)),
    notes: String(r.stderr)
      .split('\n')
      .filter(l => l.startsWith('note: '))
      .map(l => l.slice('note: '.length)),
    path: out,
  };
}

function packagedFixture() {
  return runPackager().session;
}

/** Write a variant of the example draft to a temp file and return its path. */
function withDraft(mutate, prefix = 'trwm-skill-var-') {
  const draft = JSON.parse(readFileSync(DRAFT_PATH, 'utf8'));
  mutate(draft);
  const p = join(mkdtempSync(join(tmpdir(), prefix)), 'draft.json');
  writeFileSync(p, JSON.stringify(draft), 'utf8');
  return p;
}

/** The versions the packager reports through --version. */
function reportedVersions() {
  const r = spawnSync(process.execPath, [PACKAGER, '--version'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`--version exited ${r.status}: ${r.stderr}`);
  const m = /^\S+ (\d+\.\d+\.\d+) \(targets .*? (\d+\.\d+\.\d+)\)/.exec(r.stdout);
  if (!m) throw new Error(`unexpected --version output: ${r.stdout}`);
  return { skill: m[1], helper: m[2] };
}

describe('versioning', () => {
  // SKILL_VERSION and TARGET_APP_VERSION in package_session.mjs are the
  // source: the packager is the only one of these files that ships, since a
  // skill is distributed as the skills/trwm-draft-submission folder alone.
  // Everything else is written by `npm run set-version`. These tests catch a
  // forgotten run, which would otherwise ship a file claiming a version the
  // packager does not report.

  test('every derived copy matches what the packager reports', () => {
    const { skill, helper } = reportedVersions();

    const skillMd = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
    const inSkillMd = /\*\*Skill version ([0-9]+\.[0-9]+\.[0-9]+)\.\*\* Targets TRWM SOLVE-IT Helper ([0-9]+\.[0-9]+\.[0-9]+)\./
      .exec(skillMd);
    assert.ok(inSkillMd !== null, 'SKILL.md states both versions');
    assert.equal(inSkillMd[1], skill, 'SKILL.md skill version');
    assert.equal(inSkillMd[2], helper, 'SKILL.md targeted helper version');

    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const inReadme = /Skill version ([0-9]+\.[0-9]+\.[0-9]+), targeting TRWM SOLVE-IT Helper ([0-9]+\.[0-9]+\.[0-9]+)/
      .exec(readme);
    assert.ok(inReadme !== null, 'the README states both versions');
    assert.equal(inReadme[1], skill, 'README skill version');
    assert.equal(inReadme[2], helper, 'README targeted helper version');

    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    assert.equal(pkg.version, skill, 'package.json version');
  });

  test('session-format.md states no version of its own', () => {
    // It used to restate SKILL.md exactly, which was a copy that earned
    // nothing and drifted like any other. Keep it that way.
    const format = readFileSync(join(SKILL_DIR, 'references', 'session-format.md'), 'utf8');
    assert.doesNotMatch(format, /Skill version: \*\*[0-9]/);
    assert.doesNotMatch(format, /Targeted helper version: \*\*[0-9]/);
  });

  test('the packaged session is stamped with the targeted helper version', () => {
    const { helper } = reportedVersions();
    assert.equal(packagedFixture().version, helper);
  });

  test('the packager does not target a helper release that does not exist yet', () => {
    // Only checkable against the running application, which lives in the
    // helper's repository; that suite owns the real check. Here, guard the
    // shape so a malformed version cannot pass silently.
    const { skill, helper } = reportedVersions();
    assert.match(skill, /^[0-9]+\.[0-9]+\.[0-9]+$/);
    assert.match(helper, /^[0-9]+\.[0-9]+\.[0-9]+$/);
  });
});

describe('draft validity', () => {
  test('the shipped example draft packages without a self-check complaint', () => {
    assert.deepEqual(runPackager().checks, []);
  });

  test('the packager runs when reached through a symlink', () => {
    // The skill is normally symlinked into a .claude/skills directory rather
    // than copied, so process.argv[1] is the link and import.meta.url is the
    // real path. Comparing the two naively makes the CLI a silent no-op that
    // still exits 0, which is worse than an error.
    const dir = mkdtempSync(join(tmpdir(), 'trwm-skill-link-'));
    const link = join(dir, 'package_session.mjs');
    symlinkSync(PACKAGER, link);
    const out = join(dir, 'session.json');

    const r = spawnSync(
      process.execPath, [link, DRAFT_PATH, '--out', out, '--date', '2026-01-01'],
      { encoding: 'utf8' }
    );

    assert.equal(r.status, 0);
    assert.ok(r.stderr.includes('wrote'));
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), packagedFixture());
  });

  test('a reused mitigation id is reported as a note, not a check', () => {
    // Reuse is normal, so it must not read as a problem — but the export pairs
    // the id with whatever text the draft supplies, so a reworded reuse
    // silently proposes renaming the mitigation. The note is what makes a
    // person look.
    const { checks, notes } = runPackager();
    assert.deepEqual(checks, []);
    assert.equal(notes.length, 1);
    assert.ok(notes[0].includes('DFM-1027'));
    assert.ok(notes[0].includes('Use dual tool verification'));
    assert.ok(notes[0].includes('confirm this matches the name'));
  });

  test('the example exercises the shapes the packager has to get right', () => {
    const s = packagedFixture();
    // Reordering: something must aggregate into a different position from the
    // one it was drafted in, or the ordering rule is never actually tested.
    const draft = JSON.parse(readFileSync(DRAFT_PATH, 'utf8'));
    const draftFirstEffects = draft.weaknesses.map(w => w.effect);
    const aggregatedFirstEffects = s.aggregatedWeaknesses.map(w => w.derivedFromText || w.name);
    assert.notDeepEqual(
      aggregatedFirstEffects,
      draftFirstEffects.filter(e => aggregatedFirstEffects.includes(e))
    );

    // A weakness carrying more than one error class.
    assert.ok(s.aggregatedWeaknesses.some(w => w.categories.length > 1));
    // A weakness with no causes, carried through as a plain entry.
    assert.ok(s.aggregatedWeaknesses.some(w => !w.derivedFromText));
    // A mitigation shared between two weaknesses.
    assert.ok(s.mitigationRefinement.some(m => m.weaknessIndices.length > 1));
    // More than one result, so result ordering participates.
    assert.ok(s.results.length > 1);
  });
});

describe('house style', () => {
  test('the shipped example conforms to the style guide', () => {
    // It is the worked example people copy, so it has to be right.
    assert.deepEqual(runPackager().checks, []);
  });

  test('a lower-case weakness name is a check', () => {
    const p = withDraft(d => { d.weaknesses[0].effect = 'the set of associations is incomplete'; });
    const checks = runPackager(p).checks;
    assert.ok(checks.some(c => /starts with a lower-case letter/.test(c)));
  });

  test('a lower-case technique name is a check', () => {
    const p = withDraft(d => { d.technique.name = 'extract file type associations'; });
    assert.ok(runPackager(p).checks.some(c => /technique name starts with a lower-case/.test(c)));
  });

  test('a lower-case mitigation name is a check', () => {
    const p = withDraft(d => { d.weaknesses[0].causes[0].mitigations[0].text = 'examine both stores'; });
    assert.ok(runPackager(p).checks.some(c => /mitigation .* starts with a lower-case/.test(c)));
  });

  test('a name ending with a full stop is a check', () => {
    const p = withDraft(d => { d.technique.name = 'Extract file type associations.'; });
    assert.ok(runPackager(p).checks.some(c => /ends with a full stop/.test(c)));
  });

  test('a British spelling is a check, and names the US form', () => {
    const p = withDraft(d => {
      d.technique.details = 'The examiner should analyse each artefact in the store.';
    });
    const checks = runPackager(p).checks;
    assert.ok(checks.some(c => /"analyse".*US English \("analyze"\)/.test(c)));
    assert.ok(checks.some(c => /"artefact".*US English \("artifact"\)/.test(c)));
  });

  test('each style problem names which item it is in', () => {
    // Causes of one effect share a long prefix, so the label must distinguish
    // them or a run of identical lines tells the drafter nothing.
    const p = withDraft(d => {
      for (const c of d.weaknesses[0].causes) c.text = c.text[0].toLowerCase() + c.text.slice(1);
    });
    const lower = runPackager(p).checks.filter(c => /starts with a lower-case/.test(c));
    assert.ok(lower.length > 1);
    assert.equal(new Set(lower).size, lower.length);
  });
});

describe('references', () => {
  test('a relevance summary on a source with no DFCite id is a check', () => {
    // exportRefs() emits a bare string when there is no id, so the summary is
    // dropped before the submission parser sees it. Writing one is a silent
    // loss unless it is caught here.
    const p = withDraft(d => {
      d.technique.references = [{
        DFCite_id: '', citation_text: 'A. Person, 2026. A title. A journal, 1, p.1.',
        relevance_summary_280: 'Establishes the mechanism this technique relies on.',
      }];
    });
    assert.ok(runPackager(p).checks.some(c => /will be discarded on export/.test(c)));
  });

  test('a source with no DFCite id is reported as a note', () => {
    const p = withDraft(d => {
      d.technique.references = [{
        DFCite_id: '', citation_text: 'A. Person, 2026. A title. A journal, 1, p.1.',
        relevance_summary_280: '',
      }];
    });
    assert.ok(runPackager(p).notes.some(n => n.includes('no DFCite id')));
  });

  test('a source with no DFCite id and no summary is not a check', () => {
    const p = withDraft(d => {
      d.technique.references = [{
        DFCite_id: '', citation_text: 'A. Person, 2026. A title. A journal, 1, p.1.',
        relevance_summary_280: '',
      }];
    });
    // Bare citations are supported by the TRWM submission route, so this is a
    // note about what will happen, not a problem to fix.
    assert.deepEqual(runPackager(p).checks, []);
  });

  test('a relevance summary over 280 characters is a check', () => {
    const p = withDraft(d => { d.technique.references[0].relevance_summary_280 = 'x'.repeat(281); });
    const { checks } = runPackager(p);
    assert.ok(checks.some(c => /281 characters, over the 280 limit/.test(c)));
  });

  test('exactly 280 characters is accepted', () => {
    const p = withDraft(d => { d.technique.references[0].relevance_summary_280 = 'x'.repeat(280); });
    assert.deepEqual(runPackager(p).checks, []);
  });

  test('a placeholder DFCite id is refused outright', () => {
    const p = withDraft(d => {
      d.technique.references = [{ DFCite_id: 'DFCite-TODO', citation_text: '', relevance_summary_280: '' }];
    });
    assert.throws(() => runPackager(p), /not a knowledge base citation id/);
  });
});
