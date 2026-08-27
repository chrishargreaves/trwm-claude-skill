# Developer notes

Working on the skill itself: the repository layout, the packager's flags, the
tests, and how a release is published. None of this is needed to install or use
the skill — see the [README](README.md) for that.

## Repository layout

| Path | Purpose |
|---|---|
| `skills/trwm-draft-submission/SKILL.md` | The method, the ground rules, and the nine stages |
| `skills/trwm-draft-submission/package_session.mjs` | Turns an authoring draft into a session file |
| `skills/trwm-draft-submission/references/session-format.md` | The draft format, the session format, and the derivation rules |
| `skills/trwm-draft-submission/references/example-draft.json` | A worked example of the draft format |
| `skills/trwm-draft-submission/references/draft.schema.json` | The draft format as a JSON Schema, generated from the packager |
| `package_skill.sh` | Builds a distributable archive of a skill in `skills/` |
| `scripts/set-version.mjs` | Propagates the version from the packager to everywhere else |
| `test/packager.test.mjs` | The packager as a program, the house style checks, the reference rules, version consistency |
| `test/checks.test.mjs` | The draft and knowledge base checks, and the flags |
| `test/release.test.mjs` | The release script |
| `test/skill-conformance.test.mjs` | That `SKILL.md` still describes the tool it ships with |
| `.github/workflows/test.yml` | Runs the suite on every push and pull request |
| `.github/workflows/release.yml` | Builds and publishes a release on a `v*` tag |

The example draft illustrates the format. Its weaknesses and mitigations have
not been through the method with a practitioner, so it is not a submission.

## Checking a draft against the knowledge base

The packager checks what it can on its own: the draft's structure, the
mechanical style rules, causes that would silently merge, mitigations that
differ only in punctuation, and identifiers that are the wrong shape.

Given the knowledge base it can check more, including the two failures that are
invisible in the exported bundle — an identifier that does not exist, and a
reused mitigation whose text does not match its recorded name, which proposes
renaming that mitigation everywhere it is used:

```bash
node skills/trwm-draft-submission/package_session.mjs draft.json \
  --out session.json \
  --kb https://data.solveit-df.org/solve-it.json
```

`--kb` also accepts a local path. It is off by default so an ordinary run stays
offline and reproducible. `--strict` exits 1 if any check is reported; without
it the packager writes the session and exits 0 whatever it reports, because
most checks are omissions for a person to judge rather than errors.

Three families of check, kept in separate functions on purpose:

- `selfCheck()` — is the file sound? Also runs behind `--check`.
- `knowledgeBaseChecks()` — do the identifiers exist and mean what the draft
  says? Opt-in behind `--kb`.
- `draftingChecks()` — advice about how the draft is shaped, such as two
  results whose mitigations largely coincide. Deliberately **not** in
  `selfCheck()`: `--check` diagnoses a session that will not load, and a
  question about the result list is not a defect in the file. Running it there
  made a valid session exit 1.

## Tests

```bash
npm test
```

That is `node --test`, and it installs nothing: the packager and the tests use
only the Node standard library. Run it from the repository root, since
`node --test` discovers test files relative to the working directory and exits
0 when it finds none — which is why CI checks that the suite actually ran
rather than trusting a green exit.

They cover the packager as a program, the house style checks, the reference
rules, the draft and knowledge base checks, version consistency across the
files that state a version, whether `SKILL.md` still describes the tool it
ships with, and release packaging. They do not cover whether the running
application still agrees with the packager, which needs the application itself;
that suite lives with the helper.

## Four things that are easy to get wrong

**Where the version lives.** `SKILL_VERSION` in `package_session.mjs` is the
source, because the packager is the only one of these files that ships — a
skill is distributed as the `skills/trwm-draft-submission/` folder alone, so the
version has to be resolvable from inside it. Set it there and run
`npm run set-version`, which writes it into `SKILL.md`, this repository's
`README.md` and `package.json`. The targeted helper version travels the same way
into `SKILL.md` and `README.md`. The suite fails if any copy disagrees, so a
forgotten run is caught rather than shipped.

Do not raise `TARGET_APP_VERSION` beyond what is deployed at
<https://trwm.hargs.co.uk/>: it is stamped into every session file the packager
writes, so a session would claim to target an application that does not exist
yet.

**The draft format is declared once**, as `DRAFT_SPEC` in
`package_session.mjs`. The runtime validator reads it to reject an unrecognised
key or a value of the wrong type, and `--schema` generates
`references/draft.schema.json` from it. Edit the spec, run `npm run schema`, and
commit the regenerated file; a test fails if the checked-in schema is stale. Do
not hand-edit the schema.

**A new check has to be able to fail.** Write the positive case as well as the
negative one, so the check is quiet on the shipped example rather than adding
noise. Then break the check in `package_session.mjs` and confirm the new test
fails. A test that passes against code with the check removed proves nothing,
and is easy to write by accident.

**Checks needing the knowledge base go behind `--kb`.** The default path stays
offline, so an ordinary run does not depend on the network or on what the
knowledge base holds that day.

## Building the archive

```bash
./package_skill.sh                    # defaults to trwm-draft-submission
./package_skill.sh <skill-name>
```

This writes `dist/<skill-name>-<version>.zip` with the skill folder at the
archive root, which is what the skill loader requires. Packaged the other way
round, with the files loose at the top level, a skill installs into a directory
whose name does not match it and fails to load, with nothing in the failure to
point at the cause. The script verifies its own output before reporting
success, which is why it is a script rather than a line of documentation. The
version in the filename is read from the skill rather than passed in, so an
archive cannot be mislabelled.

## Publishing a release

```bash
# 1. set SKILL_VERSION in skills/trwm-draft-submission/package_session.mjs
npm run set-version                   # propagates it to SKILL.md, README, package.json
# 2. write the "## [<version>]" section in CHANGELOG.md
npm test                              # fails if any of those disagree
# 3. commit, then:
git tag v<version> && git push --tags
```

`.github/workflows/release.yml` does the rest: it runs the suite, refuses a tag
that disagrees with the version the packager reports, refuses one with no
changelog section, builds the archive and publishes the release with that
section as the notes and the zip attached.

The tag check is the one that earns its place. The archive is named from
`SKILL_VERSION`, so a tag saying otherwise would attach an archive labelled one
version to a release called another, and nothing downstream would notice.

Changelog headings carry the version and nothing else. Whether a version
shipped is recorded by the tags and the releases, which is the only place that
can answer it correctly — a date written in the changelog says when the notes
were written, not when anyone could install the thing.
