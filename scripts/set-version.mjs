#!/usr/bin/env node
//
// Propagate the version from package_session.mjs to everywhere else.
//
//   1. edit SKILL_VERSION and TARGET_APP_VERSION in package_session.mjs
//   2. npm run set-version
//
// Not called `version`: that is an npm lifecycle name, and `npm version <x>`
// would run this script straight after bumping package.json, overwriting the
// bump with whatever SKILL_VERSION says and quietly undoing it.
//
// The packager is the source because it is the only one of these files that
// ships: a skill is distributed as the skills/trwm-draft-submission folder,
// without package.json or the README, so the version has to be resolvable
// from inside that folder alone.
//
// The copies exist because each is read by someone different — an agent
// opening SKILL.md, a person browsing the repository, npm — and none of them
// should have to run a command to learn the version. What they should not be
// is separately maintained, which is what this script is for. The suite fails
// if any of them disagrees, so a forgotten run is caught rather than shipped.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGER = join(REPO, 'skills', 'trwm-draft-submission', 'package_session.mjs');

const src = readFileSync(PACKAGER, 'utf8');
const skill = /^const SKILL_VERSION = '([0-9]+\.[0-9]+\.[0-9]+)';$/m.exec(src);
const helper = /^const TARGET_APP_VERSION = '([0-9]+\.[0-9]+\.[0-9]+)';$/m.exec(src);
if (!skill || !helper) {
  process.stderr.write('could not read SKILL_VERSION / TARGET_APP_VERSION from the packager\n');
  process.exit(1);
}

/** Rewrite one file, failing loudly rather than silently doing nothing. */
function rewrite(relative, pattern, replacement) {
  const path = join(REPO, relative);
  const before = readFileSync(path, 'utf8');
  if (!pattern.test(before)) {
    process.stderr.write(`${relative}: nothing matched ${pattern} — has the wording changed?\n`);
    process.exit(1);
  }
  const after = before.replace(pattern, replacement);
  if (after !== before) {
    writeFileSync(path, after, 'utf8');
    return `  updated ${relative}`;
  }
  return `  ${relative} already current`;
}

const lines = [
  rewrite('skills/trwm-draft-submission/SKILL.md',
    /\*\*Skill version [0-9]+\.[0-9]+\.[0-9]+\.\*\* Targets TRWM SOLVE-IT Helper [0-9]+\.[0-9]+\.[0-9]+\./,
    `**Skill version ${skill[1]}.** Targets TRWM SOLVE-IT Helper ${helper[1]}.`),
  rewrite('README.md',
    /Skill version [0-9]+\.[0-9]+\.[0-9]+, targeting TRWM SOLVE-IT Helper [0-9]+\.[0-9]+\.[0-9]+/,
    `Skill version ${skill[1]}, targeting TRWM SOLVE-IT Helper ${helper[1]}`),
  rewrite('package.json',
    /"version": "[0-9]+\.[0-9]+\.[0-9]+"/,
    `"version": "${skill[1]}"`),
];

process.stderr.write(
  `skill ${skill[1]}, targeting helper ${helper[1]}\n${lines.join('\n')}\n`
);
