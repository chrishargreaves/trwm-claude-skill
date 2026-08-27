// Does SKILL.md still describe the tool it ships with?
//
// SKILL.md is instructions to an agent, and most of it is judgement that no
// test can check. But it also makes mechanical claims — commands to run, flags
// to pass, files to read, stages to work through in order — and those drift
// silently. Rename a flag, renumber a stage, move a reference file, and the
// skill goes on telling an agent to do something that no longer works. Nothing
// caught that before this file.
//
// These tests read the claims out of SKILL.md rather than restating them, so
// they cannot fall out of step with it in turn.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const SKILL_DIR = join(process.cwd(), 'skills', 'trwm-draft-submission');
const PACKAGER = join(SKILL_DIR, 'package_session.mjs');
const DRAFT_PATH = join(SKILL_DIR, 'references', 'example-draft.json');
const SKILL_MD = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');

/** A knowledge base fixture, so the command tests stay offline. */
function localKb() {
  const p = join(mkdtempSync(join(tmpdir(), 'trwm-conf-kb-')), 'kb.json');
  writeFileSync(p, JSON.stringify({
    techniques: { 'DFT-1001': { id: 'DFT-1001', name: 'Triage devices or media', references: [{ DFCite_id: 'DFCite-1060' }] } },
    weaknesses: {},
    mitigations: { 'DFM-1027': { id: 'DFM-1027', name: 'Use dual tool verification', references: [] } },
  }), 'utf8');
  return p;
}

describe('SKILL.md front matter', () => {
  test('declares a name matching the folder it ships in', () => {
    // The loader resolves a skill by folder name; a mismatch fails to load
    // with nothing in the failure to say why.
    const m = /^---\n([\s\S]*?)\n---\n/.exec(SKILL_MD);
    assert.ok(m, 'SKILL.md opens with front matter');
    const name = /^name:\s*(.+)$/m.exec(m[1]);
    assert.ok(name, 'front matter declares a name');
    assert.equal(name[1].trim(), basename(SKILL_DIR));
  });

  test('declares a description', () => {
    const m = /^---\n([\s\S]*?)\n---\n/.exec(SKILL_MD);
    const d = /^description:\s*(.+)$/m.exec(m[1]);
    assert.ok(d, 'front matter declares a description');
    assert.ok(d[1].trim().length > 40, 'the description says what the skill is for');
  });
});

describe('SKILL.md names files that exist', () => {
  test('every references/ path it mentions is present', () => {
    const paths = [...new Set([...SKILL_MD.matchAll(/`(references\/[a-zA-Z0-9._-]+)`/g)].map(m => m[1]))];
    assert.ok(paths.length > 0, 'SKILL.md mentions reference files');
    const missing = paths.filter(p => !existsSync(join(SKILL_DIR, p)));
    assert.deepEqual(missing, [], `SKILL.md names files that do not exist: ${missing.join(', ')}`);
  });

  test('its Files section lists exactly what ships', () => {
    // The section is the manifest an agent reads to know what it has.
    const section = SKILL_MD.slice(SKILL_MD.indexOf('## Files'));
    const listed = [...new Set([...section.matchAll(/^- `([^`]+)`/gm)].map(m => m[1]))];
    assert.ok(listed.length >= 3, 'the Files section lists the shipped files');
    for (const f of listed) {
      assert.ok(existsSync(join(SKILL_DIR, f)), `Files lists ${f}, which does not exist`);
    }
  });
});

describe('SKILL.md names flags the packager accepts', () => {
  test('every flag it mentions is understood', () => {
    const flags = [...new Set([...SKILL_MD.matchAll(/`?(--[a-z][a-z-]+)`?/g)].map(m => m[1]))];
    assert.ok(flags.length > 0, 'SKILL.md names flags');
    const usage = spawnSync(process.execPath, [PACKAGER], { encoding: 'utf8' });
    const help = String(usage.stderr) + String(usage.stdout);
    const unknown = flags.filter(f => !help.includes(f));
    assert.deepEqual(unknown, [],
      `SKILL.md tells an agent to pass ${unknown.join(', ')}, which the packager's usage does not mention`);
  });

  test('--version prints what SKILL.md says it prints', () => {
    // SKILL.md tells the reader to run it to find out which copy they have.
    assert.ok(/--version/.test(SKILL_MD), 'SKILL.md mentions --version');
    const r = spawnSync(process.execPath, [PACKAGER, '--version'], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^trwm-draft-submission \d+\.\d+\.\d+ \(targets .+ \d+\.\d+\.\d+\)/);
  });
});

describe('SKILL.md stages are coherent', () => {
  const headings = [...SKILL_MD.matchAll(/^## Stage (\d+) — (.+)$/gm)]
    .map(m => ({ n: Number(m[1]), title: m[2] }));

  test('are numbered from 1 with no gaps or repeats', () => {
    assert.ok(headings.length > 0, 'SKILL.md has numbered stages');
    assert.deepEqual(headings.map(h => h.n), headings.map((_, i) => i + 1));
  });

  test('every "stage N" cross-reference points at a stage that exists', () => {
    // Inserting a stage renumbers everything after it, and the references to
    // them are scattered through the file.
    const highest = headings.length;
    const refs = [...new Set([...SKILL_MD.matchAll(/\bstages? (\d+)\b/gi)].map(m => Number(m[1])))];
    const dangling = refs.filter(n => n < 1 || n > highest);
    assert.deepEqual(dangling, [],
      `SKILL.md refers to stage ${dangling.join(', ')} but only has ${highest}`);
  });

  test('every quoted section name it points at is a real heading', () => {
    // Sections get renamed; the pointers to them do not follow on their own.
    // Markdown wraps, so a pointer routinely spans a line break and the
    // captured text carries a newline the heading does not have.
    const flat = t => t.replace(/\s+/g, ' ').trim();
    const pointers = [...new Set(
      [...SKILL_MD.matchAll(/\bSee "([^"]+)"/gi)].map(m => flat(m[1]))
    )];
    assert.ok(pointers.length > 0, 'SKILL.md points at its own sections');
    const headingTexts = [...SKILL_MD.matchAll(/^#{2,3} (?:Stage \d+ — )?(.+)$/gm)]
      .map(m => flat(m[1]));
    const missing = pointers.filter(n => !headingTexts.some(h => h === n || h.startsWith(n)));
    assert.deepEqual(missing, [],
      `SKILL.md points at sections that do not exist: ${missing.join(' | ')}`);
  });
});

describe('the command SKILL.md documents actually runs', () => {
  test('the packaging invocation works as written', () => {
    // Taken from the bash block in stage 9, with its placeholders filled in.
    const block = /```bash\n([\s\S]*?)```/.exec(SKILL_MD.slice(SKILL_MD.indexOf('## Stage 9')));
    assert.ok(block, 'stage 9 shows the packaging command');
    const cmd = block[1].replace(/\\\n\s*/g, ' ').trim();
    assert.match(cmd, /package_session\.mjs/);
    assert.match(cmd, /--out/);
    assert.match(cmd, /--kb/);

    // Run the same shape: draft in, session out, knowledge base checked.
    const out = join(mkdtempSync(join(tmpdir(), 'trwm-conf-')), 'session.json');
    const r = spawnSync(process.execPath,
      [PACKAGER, DRAFT_PATH, '--out', out, '--kb', localKb(), '--date', '2026-01-01'],
      { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(out), 'the documented command wrote a session');
  });

  test('the diagnostic invocations work as written', () => {
    // SKILL.md tells the drafter to reach for these when a session will not
    // load, which is the worst moment to discover the flag has been renamed.
    const out = join(mkdtempSync(join(tmpdir(), 'trwm-conf2-')), 'session.json');
    spawnSync(process.execPath, [PACKAGER, DRAFT_PATH, '--out', out, '--date', '2026-01-01']);

    for (const args of [['--check', out, '--session-schema', join(SKILL_DIR, 'references', 'draft.schema.json')],
                        ['--repair', out, '--out', '/dev/null']]) {
      const r = spawnSync(process.execPath, [PACKAGER, ...args], { encoding: 'utf8' });
      assert.doesNotMatch(String(r.stderr), /usage:/, `${args[0]} was not understood`);
      assert.doesNotMatch(String(r.stderr), /TypeError/, `${args[0]} crashed`);
    }
  });
});
