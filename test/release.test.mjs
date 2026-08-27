// Tests for package_skill.sh, the release script.
//
// A skill archive has to contain the skill folder as its root. Packaged the
// other way round — files loose at the top level — it installs into a
// directory whose name does not match the skill and fails to load, with
// nothing in the failure to point at the cause. It is an easy mistake and an
// expensive one, so package_skill.sh verifies its own output and these tests
// verify the verification.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();
const SCRIPT = join(REPO, 'package_skill.sh');
const SKILL = 'trwm-draft-submission';

function run(args = []) {
  return spawnSync('bash', [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' });
}

/** Entries inside a zip, without invoking the script's own checks. */
function entries(zipPath) {
  const r = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`unzip failed: ${r.stderr}`);
  return r.stdout.trim().split('\n').filter(Boolean);
}

const haveZip = spawnSync('sh', ['-c', 'command -v zip && command -v unzip'], { encoding: 'utf8' }).status === 0;

describe('skill release packaging', { skip: haveZip ? false : 'zip and unzip are needed to package a skill' }, () => {
  test('builds an archive with the skill folder at its root', () => {
    const r = run();
    assert.equal(r.status, 0, r.stderr);

    const m = /built (\S+\.zip)/.exec(r.stdout);
    assert.ok(m !== null, `no archive path in output: ${r.stdout}`);
    const zip = m[1];
    assert.ok(existsSync(zip));

    const list = entries(zip);
    // Every entry under the skill folder — this is the whole point.
    for (const e of list) assert.ok(e.startsWith(`${SKILL}/`), `loose entry: ${e}`);
    // And nothing loose at the top level.
    assert.ok(!list.some(e => e === 'SKILL.md'));

    assert.ok(list.includes(`${SKILL}/SKILL.md`));
    assert.ok(list.includes(`${SKILL}/package_session.mjs`));
    assert.ok(list.includes(`${SKILL}/references/session-format.md`));
    assert.ok(list.includes(`${SKILL}/references/example-draft.json`));
  });

  test('the archive is named for the version the skill reports', () => {
    const v = spawnSync(process.execPath,
      [join(REPO, 'skills', SKILL, 'package_session.mjs'), '--version'],
      { encoding: 'utf8' });
    const version = /(\d+\.\d+\.\d+)/.exec(v.stdout)[1];
    const r = run();
    assert.ok(r.stdout.includes(`${SKILL}-${version}.zip`));
  });

  test('macOS clutter is excluded', () => {
    const junk = join(REPO, 'skills', SKILL, '.DS_Store');
    writeFileSync(junk, 'x');
    try {
      const r = run();
      const zip = /built (\S+\.zip)/.exec(r.stdout)[1];
      assert.ok(!entries(zip).some(e => e.includes('.DS_Store')));
    } finally {
      rmSync(junk, { force: true });
    }
  });

  test('a folder name that disagrees with SKILL.md is refused', () => {
    // The folder name becomes the archive root, so it has to match the name
    // the skill declares — otherwise the archive is well-formed and still
    // broken.
    const dir = join(REPO, 'skills', 'tmp-release-test');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: a-different-name\ndescription: x\n---\n');
    try {
      const r = run(['tmp-release-test']);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /must match/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a skill that does not exist is refused', () => {
    const r = run(['no-such-skill']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no skill at/);
  });
});
