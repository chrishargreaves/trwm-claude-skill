# TRWM drafting skill

`skills/trwm-draft-submission/` is a [Claude Code](https://claude.com/claude-code)
skill that drafts a [SOLVE-IT](https://solveit-df.org/) knowledge base
submission through the TRWM-AC method, and packages it as a session file that
the [TRWM SOLVE-IT Helper](https://trwm.hargs.co.uk/) can load for review.

This is experimental. It is offered as a working example of what a structured
drafting method looks like when an agent is asked to follow it, rather than as
a finished tool.

## What TRWM is

TRWM works through a digital forensic **T**echnique by asking what **R**esults
it produces, what **W**eaknesses each result can have, and what **M**itigations
reduce those weaknesses. The TRWM-AC variant used here splits each weakness
into an *effect*, meaning what goes wrong, and one or more *causes*, so that
mitigations attach per cause. Two causes of the same effect normally need
different remedies, and that distinction is lost if the weakness is recorded as
a single statement.

Weaknesses are found by working through six ASTM error classes. The classes are
prompts rather than a taxonomy to fit answers into: their purpose is to make a
person consider failures they would not otherwise have reached.

## What the skill does

It runs the method as a conversation in nine stages, from establishing that
there is a genuine gap in the knowledge base through to packaging the result.
It writes a JSON draft as it goes, so an interrupted run leaves something
usable, and a companion note recording why each decision was taken.

Three constraints shape how it behaves, and they are the reason it is a skill
rather than a prompt:

- **It does not invent knowledge base content.** Every CASE/UCO class IRI and
  every `DFT-`, `DFW-`, `DFM-` and `DFCite-` identifier comes from a lookup. If
  no lookup is available it says so and leaves the field empty.
- **It does not go looking for references.** It cites only sources the user
  names, and only after resolving them against a real record. A fabricated
  citation is the one error in a submission that cannot be caught by reading it.
- **At the weakness stage the user answers first.** Candidate weaknesses are
  offered only after the user has given their own, and are marked as
  suggestions. Approving a list is a weaker act than generating one, and the
  weaknesses nobody thinks of are the reason the method exists.

The skill does not submit anything. Its output is a draft for a person to
review in the application that was built for reviewing it. The helper runs in
the browser at <https://trwm.hargs.co.uk/>, and the session file is loaded
through **Import from File**. The user then walks the stages there, revises
whatever needs revising, and exports the submission bundle from the
application.

## Installing

Two routes, depending on where you use Claude.

### Upload the archive — Claude desktop and web

Build the archive, or take one from a release if there is one:

```bash
./package_skill.sh          # writes dist/trwm-draft-submission-<version>.zip
```

Then in the skills area, **Add → Upload skill**, and choose that `.zip`.

The archive has to contain the skill folder at its root, not the files loose
at the top level. Packaged the wrong way round it installs under a directory
name that does not match the skill and fails to load, with nothing in the
failure to say why — which is why `package_skill.sh` exists and verifies its
own output rather than leaving you to zip the folder by hand.

### Copy the folder — Claude Code

```bash
cp -r skills/trwm-draft-submission ~/.claude/skills/
```

Either the user-level `~/.claude/skills/` or a project-level `.claude/skills/`.
A symlink works too, and is what to use when you are editing the skill and
want the changes live. The folder name has to match the `name:` in the skill's
front matter, so keep it as `trwm-draft-submission`.

### What it needs to run

Node 18 or later, and no dependencies. Reaching the knowledge base needs either
a SOLVE-IT MCP server or network access to
<https://data.solveit-df.org/solve-it.json>, which is rebuilt daily. Verifying
a class IRI needs the ontology namespaces to be reachable; the skill says so
and leaves the field empty rather than guessing when they are not.

## Files

| Path | Purpose |
|---|---|
| `skills/trwm-draft-submission/SKILL.md` | The method, the ground rules, and the nine stages |
| `skills/trwm-draft-submission/package_session.mjs` | Turns an authoring draft into a session file |
| `skills/trwm-draft-submission/references/session-format.md` | The draft format, the session format, and the derivation rules |
| `skills/trwm-draft-submission/references/example-draft.json` | A worked example of the draft format |
| `skills/trwm-draft-submission/references/draft.schema.json` | The draft format as a JSON Schema, generated from the packager |
| `package_skill.sh` | Builds a distributable archive of a skill in `skills/` |
| `test/packager.test.mjs` | Tests for the packager, the house style checks and the reference rules |
| `test/checks.test.mjs` | Tests for the draft and knowledge base checks, and the flags |
| `test/release.test.mjs` | Tests for the release script |

The example draft illustrates the format. Its weaknesses and mitigations have
not been through the method with a practitioner, so it is not a submission.

## Checking a draft against the knowledge base

The packager checks what it can on its own: the draft's structure, the
mechanical style rules, causes that would silently merge, mitigations that
differ only in punctuation, and identifiers that are the wrong shape.

Given the knowledge base it can check more, including the two failures that
are invisible in the exported bundle — an identifier that does not exist, and
a reused mitigation whose text does not match its recorded name, which
proposes renaming that mitigation everywhere it is used:

```bash
node skills/trwm-draft-submission/package_session.mjs draft.json \
  --out session.json \
  --kb https://data.solveit-df.org/solve-it.json
```

`--kb` also accepts a local path. It is off by default so an ordinary run stays
offline and reproducible. `--strict` exits 1 if any check is reported; without
it the packager writes the session and exits 0 whatever it reports, because
most checks are omissions for a person to judge rather than errors.

## Diagnosing a session

A session that does not conform still holds work that took hours, so the
packager explains and mends rather than refusing:

```bash
node skills/trwm-draft-submission/package_session.mjs --check  session.json
node skills/trwm-draft-submission/package_session.mjs --repair session.json --out fixed.json
```

`--check` reports structural problems and every departure from the schema
published at <https://trwm.hargs.co.uk/session.schema.json>, each with its
path. `--repair` mends only what is derived — an index that must equal its
position, a stale hash, a missing container — reports every change, and keeps
everything it will not guess at, including keys the application drops on
import.

## Tests

```bash
npm test
```

That is `node --test`, and it installs nothing: the packager and the tests use
only the Node standard library. Run it from the repository root, since
`node --test` discovers test files relative to the working directory and exits
0 when it finds none. The suite is 58 tests.

They cover the packager as a program, the house style checks, the reference
rules, version consistency across the files that state a version, and release
packaging. They do not cover whether the running application still agrees with
the packager, which needs the application itself; that suite lives with the
helper and is run before a release.

## Working on the skill

Four things are easy to get wrong later and are worth stating here.

**The version appears in five places**, and four of them are checked by the
suite: `SKILL_VERSION` in `package_session.mjs`, the header lines of `SKILL.md`
and `references/session-format.md`, the Versions section of this README, and
`package.json`. The targeted helper version appears in three. Change one and
the tests will tell you about the rest. Do not raise the targeted version
beyond what is deployed at <https://trwm.hargs.co.uk/>: it is stamped into
every session file the packager writes.

**The draft format is declared once**, as `DRAFT_SPEC` in
`package_session.mjs`. The runtime validator reads it to reject an
unrecognised key or a value of the wrong type, and `--schema` generates
`references/draft.schema.json` from it. Edit the spec, run `npm run schema`,
and commit the regenerated file; a test fails if the checked-in schema is
stale. Do not hand-edit the schema.

**A new check has to be able to fail.** Write the positive case as well as the
negative one, so the check is quiet on the shipped example rather than adding
noise. Then disable the check in `package_session.mjs` and confirm the new test
fails. A test that passes against code with the check removed proves nothing,
and is easy to write by accident.

**Checks needing the knowledge base go behind `--kb`.** The default path stays
offline, so an ordinary run does not depend on the network or on what the
knowledge base holds that day.

## Releasing

```bash
./package_skill.sh                    # defaults to trwm-draft-submission
./package_skill.sh <skill-name>
```

This writes `dist/<skill-name>-<version>.zip` with the skill folder at the
archive root, which is what the skill loader requires. It is the same archive
the **Upload skill** route above takes, so building it is an install step as
much as a release one. Packaged the other way
round, with the files loose at the top level, a skill installs into a directory
whose name does not match it and fails to load, with nothing in the failure to
point at the cause. The script verifies its own output before reporting
success. The version in the filename is read from the skill rather than passed
in, so an archive cannot be mislabelled.

## Versions

Skill version 0.18.0, targeting TRWM SOLVE-IT Helper 3.8.0, which is the
version currently deployed at <https://trwm.hargs.co.uk/>. The packager stamps
the targeted version into the `version` field of every session file it writes.

The version is deliberately below 1.0. The method works and the packager is
well covered, but the skill has had few real runs, and the ones it has had
produced a list of corrections rather than a clean result. Expect the
instructions to change.

```bash
node skills/trwm-draft-submission/package_session.mjs --version
```

The version is recorded in three places: `SKILL_VERSION` in
`package_session.mjs`, the header of `SKILL.md`, and the top of
`references/session-format.md`. A bump has to be applied to all three.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
