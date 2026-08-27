# Changelog

The skill was developed under 1.x version numbers while it lived in the TRWM
SOLVE-IT Helper repository, and reached 1.8.0. Those numbers claimed a maturity
it has not earned: the method works and the packager is well covered by tests,
but the skill has had few real runs, and the runs it has had produced a list of
corrections rather than a clean result.

Every version below has therefore been renumbered from 1.x to 0.x, keeping the
minor and patch numbers, so 1.8.0 became 0.8.0. Nothing was ever released under
the old numbering — there are no published archives and no GitHub releases — so
the renumbering rewrites no history that anyone else can see.

## [0.19.0] — unreleased

Four changes from an unattended run of the skill against a real proposal —
metadata inside video and audio files — drafted end to end with a separate
agent playing the practitioner. The run produced a session file that imports
and validates; what it produced besides that was these.

**The submission now says what it implies about its neighbours.** Stage 1 finds
the nearest existing techniques and nothing looked at them again, yet by the end
the draft says something about them. In the run, ten of the thirteen weaknesses
applied just as well to DFT-1100 (Extract metadata from within images), which
records none — so the submission implied its sibling was substantially
incomplete, and never said so. Stage 6 now asks for that count by name, in the
rationale and to the user. It is not a request to draft weaknesses for the
neighbour; it is that a reviewer will notice, and it tells the project where an
entry is bare because nobody has looked at it rather than because there is
nothing to find.

**One error class at a time is stated as the process rather than implied.** The
instruction was six prompts "in turn", while the skill elsewhere insists on
economy — tables for reviewable sets, deciding rather than asking twice. Read
literally it is six exchanges per result; read for its spirit it is one message.
Both were defensible, which means the rule was not doing its job. It now says
the cost is intended, because the classes work by making a person consider one
kind of failure at a time and six questions in one message get skimmed as one.
A user may ask for them together and that is their call; the drafter may not
decide it on their behalf.

**Stage 9 asks who the submission is from.** `authors` was never mentioned in
`SKILL.md` and the run shipped a session with the field empty. The skill now
asks once, takes no for an answer, and adds `trwm-claude-skill` as a further
author either way — not for credit, but so a reviewer reading the entry later
can tell it was drafted through this skill and weigh it accordingly.

**The location step is split by environment.** It told the drafter to propose a
directory and take the user's answer, which only makes sense where there is a
filesystem to choose in. In the browser and desktop applications there is no
location to propose: the session file is handed over and that is the delivery.
The two cases are now separate, and the instruction to say where the working
files are has moved to the step that tells the user things rather than the step
that picks a location.

## [0.18.0] — unreleased

**`SKILL.md` is now tested.** It is instructions to an agent, and most of it is
judgement no test can check — but it also makes mechanical claims that drift
silently. Rename a flag, renumber a stage, move a reference file, and the skill
goes on telling an agent to do something that no longer works. Nothing caught
that before.

`test/skill-conformance.test.mjs` reads the claims out of `SKILL.md` rather
than restating them, so the test cannot fall out of step with it in turn. It
checks that the front matter names the folder the skill ships in, that every
`references/` path and every entry in the Files section exists, that every flag
the prose names is one the packager documents, that the stages are numbered
from 1 with no gaps and every "stage N" cross-reference resolves, that every
`See "…"` pointer names a real heading, and that the packaging and diagnostic
commands run as written.

Verified to bite: misspelling the front-matter name, renaming a reference file,
renaming a flag in the prose only, misnumbering a stage, staling a section
pointer, and renaming the Files section each make it fail.

**The packager's usage text now documents `--version`, `--schema` and
`--date`.** The conformance test found them: `SKILL.md` tells an agent to run
`--version` to find out which copy it has, and the tool's own help had never
mentioned it, so anyone running the packager with no arguments could not learn
it existed.

## [0.17.0] — unreleased

Ten defects found by a code review of `package_session.mjs`, all reproduced
before being fixed and each now covered by a regression test. Every fix was
mutation-tested by reverting it and confirming the suite fails. The suite goes
from 64 tests to 75.

Three were serious.

- **Weakness-level `mitigations`, `description` and `references` were silently
  dropped whenever the weakness had causes.** The draft format permits them,
  but the aggregation reads those fields from the cause once causes exist, so a
  mitigation written at weakness level vanished with no check and no note. This
  is the same silent-data-loss class the packager rejects unrecognised keys to
  prevent. Which cause a weakness-level mitigation belongs to cannot be worked
  out, so the combination is now refused with a message saying where to move
  it. A weakness with no causes still uses its own fields, which is what the
  shipped example relies on.
- **`--repair` crashed with a raw stack trace on the malformed sessions it
  exists to mend.** `mitigationDataHash` assumed every mitigation was an object
  with text; the helper's own copy guards this and ours had drifted. A null
  entry, or a non-array value under a weakness index, threw before anything was
  written or reported.
- **`--check` abandoned every structural check when an optional container was
  absent.** `ontologyOutputClasses` is optional and the helper backfills it, but
  reading `.length` threw, so the only output was "too malformed to check
  structurally" and no finding at all — while `--repair` on the same file said
  "nothing needed repairing".

The rest:

- `--kb` and `--session-schema` were missing from the list of flags that take a
  value, so `--kb file.json draft.json` parsed the knowledge base as the draft.
- `--kb` with nothing after it silently disabled every knowledge base check and
  exited 0, the precise outcome the hard error on an unreadable `--kb` exists
  to prevent. It is now a usage error.
- A `mitigationDetails` entry matching no mitigation lost its description,
  references and linked technique without a word. Matching folds case and
  spacing but not punctuation, so a trailing full stop was enough.
- `technique.id` was never validated, for shape or existence — the one
  identifier that names the whole submission, on a skill whose central rule is
  that identifiers come from a lookup. `DFT-XXXX` remains the placeholder for a
  new technique.
- The "technique name already in the knowledge base" check fired even when the
  draft was deliberately drafted against that technique's id, so revising an
  existing technique always reported a false positive and failed under
  `--strict`.
- Draft keys named `constructor`, `toString` or `hasOwnProperty` resolved
  through `Object.prototype` and bypassed the unrecognised-key rejection
  entirely, dropping their contents — again the failure that check exists to
  prevent. Now `Object.hasOwn`.
- `--repair` could never report a container as "missing", only as "not an
  array", because the value was overwritten before the message was built.

## [0.16.0] — unreleased

**Installing now covers both routes.** It described copying the folder into a
`.claude/skills/` directory, which is the Claude Code route, and said nothing
about uploading the archive — which is how a skill is installed in the desktop
and web applications, through **Add → Upload skill**.

The archive was already the right artefact for that: `package_skill.sh` builds
a zip with the skill folder at its root, which is exactly what the upload
expects, and refuses to produce one with the files loose at the top level. But
it was filed under Releasing as though it were only a maintainer's concern, so
someone installing had no reason to look at it. Building the archive is now
described as an install step as much as a release one.

The section also states what the skill needs to run in either case: Node 18 or
later with no dependencies, a route to the knowledge base, and reachable
ontology namespaces for verifying a class IRI.

## [0.15.0] — unreleased

Until now nothing checked the session the packager produced. The draft was
validated, the session was assembled by code and pruned to the keys the helper
accepts, and seven advisory `selfCheck` lines looked at the result — but the
published schema was never consulted at the moment a session was written. The
one place a session was schema-validated was a test in the helper's suite,
against a single fixture.

**`selfCheck` now asserts the facts the schema encodes**, in plain code so they
are caught without a reachable schema and named in words rather than as a JSON
pointer: result ids of the form `DFTR<n>`, a mitigation map keyed by weakness
indices, error classes drawn from the six, a known `workflowVariant`, and
`lastMitAggregationHash` agreeing with the mitigations it summarises. It also
reports a key the helper does not accept — the schema permits extras because
the application drops them, and dropping is exactly what makes them worth
mentioning.

**`--check <session.json>`** diagnoses a session against both the structural
checks and the published schema, each problem with its path. The schema is read
from <https://trwm.hargs.co.uk/session.schema.json> unless `--session-schema`
names a file or another URL, and one that cannot be loaded is an error rather
than a skipped check.

**`--repair <session.json> --out <fixed.json>`** mends what is derived or
structural — an index that must equal its position, a hash that is a function
of the mitigations, a missing container, a malformed date — and reports each as
a `fixed:` line. Anything carrying meaning is reported as `manual:` and left
alone, including keys the helper does not accept, which are **kept in the
repaired file**. Which weakness an out-of-range mitigation belongs to cannot be
derived, so it is never guessed. A test asserts no path present before a repair
is absent after it, because the reason this exists is that a non-conforming
session still holds hours of work.

**A JSON Schema validator, written into the packager** because the skill ships
without dependencies. It covers the constructs the SOLVE-IT schemas use:
`type`, `enum`, `pattern`, `maxLength`, `minimum`, `required`, `properties`,
`additionalProperties`, `patternProperties`, `propertyNames`, `items`, `anyOf`
and `$ref`.

A hand-written validator that is subtly wrong is worse than none, since it
reports success — so it is not trusted on its own. `test/validator-oracle.spec.js`
in the helper runs it against ajv over a real session and fifteen sessions each
broken in one specific way, and fails if the two disagree. Removing the enum
check, the pattern check, or the validator's body all make that test fail, so
it is known to bite rather than assumed to.

## [0.14.0] — unreleased

**A "Where this skill is running" section, and a correction to stage 9.**
0.7.0 told the drafter to write the working files to a `working/` directory and
said they "must be durable", citing a previous run lost when its container was
wiped. In a container no path is durable, so that instruction could not be
followed in the environment whose failure it was written about — and an agent
following it would believe it had persisted the files when it had not. That is
the same failure again, one level up.

The new section separates the two cases. On a real filesystem, `working/`
beside the delivery location is durable and nothing more is needed. In an
ephemeral container, durability means getting the file out, so the working
files are **offered at the end** — after the session file, in a separate
sentence, as working files to keep or discard rather than as results. That is
not a contradiction of "produce one file": there is still one deliverable, and
the rest are offered as the only way to save them. Where the filesystem is
real, they are not offered, because there they are already safe and offering
them is what turns one deliverable into four.

It also says what to do where `node` is absent: say so at stage 1 rather than
stage 9. The draft is still worth writing, but the user should know it cannot
be packaged before spending an hour on it.

**Fetching `--kb` is a different capability from reaching the knowledge base.**
Stage 1 may succeed through an MCP server while the packager has no outbound
network, and a `--kb` it cannot read is a hard error that writes nothing. Stage
9 now says to point `--kb` at a saved copy where the fetch fails, and where
that is not possible to run without it and **say in the report that the
identifier checks did not run**. An absent check the user knows about is a
different thing from one they assume happened.

## [0.13.0] — unreleased

**A generated relevance summary is now a draft to be corrected, not an
answer.** The rule already allowed one where the source had been read. That
permission was too broad: a summary written from the source says what the
source is *about*, while `relevance_summary_280` has to say why it is being
cited *here*, against this technique or this weakness. Judging which paragraph,
section or figure carries the point requires knowing which claim in the
submission it supports, and that judgement belongs to the person making the
claim.

The skill now prefers the user's wording even where it has read the source, and
must say so: show the draft, say what was read to produce it, say plainly that
it is likely to be less precise and may name the wrong part of the source, and
take the correction. A summary the user has not read and accepted is not kept.

The reasoning is stated in the skill because this is the field most likely to
look finished while being wrong. A summary naming the wrong section reads
exactly like one naming the right section, so it is harder to catch than an
empty field, and it stays in the knowledge base for everyone who reuses the
entry.

## [0.12.0] — unreleased

**A "Reaching the ontologies" section, alongside the one for the knowledge
base.** The skill required every class IRI to be verified before it was
offered, and never said where to verify it. The two sources answer different
questions and were being conflated: the knowledge base says which techniques
already use a class, the ontologies say whether it exists and what it means.

Fetching an IRI is a real existence check rather than a formality. All three
namespaces — `ontology.unifiedcyberontology.org`, `ontology.caseontology.org`
and `ontology.solveit-df.org` — return 404 for a class that does not exist and
documentation for one that does, so the same fetch that proves the IRI
resolves also says what it means. Verified against all three before writing it
down.

For searching rather than checking, the section names the Turtle sources: the
SOLVE-IT ontology is split across modules in `SOLVE-IT-DF/solve-it-ontology`
with no combined file, and `ontology.solveit-df.org` publishes documentation
rather than Turtle — worth knowing before hunting for a `.ttl` that is not
there. UCO and CASE sources sit under `ontology/` in their own repositories.

Where the ontologies cannot be reached, the class fields are left empty and the
skill says so. An empty field is a visible gap; an unverified IRI is not.

## [0.11.0] — unreleased

**Targets TRWM SOLVE-IT Helper 3.8.0**, which added a top-level `rationale`
field to the session format. The helper carries it into the exported bundle
under `provenance`, so the reasoning travels inside the submission rather than
in a file beside it — which is how a previous drafting run was lost entirely
when the container holding it was wiped.

- `rationale` added to the draft format, so the packager accepts it, validates
  its type, emits it, and describes it in the generated schema.
- Stage 9 gained a step telling the drafter to fill it in: a condensed form of
  the rationale note, covering what the technique was scoped to and what was
  excluded, the causes cut at stage 6, the error classes that came to nothing,
  and any decisions taken by default. The note stays as the full record.

**"Decide rather than ask twice" became "Ask at most twice, then decide — and
keep the question."** The original rule suppressed a repeated question but lost
it. A question may now be put a second time, worded differently in case the
first attempt was the problem; after that the call is made, stated as a call,
and marked reversible — and recorded in the rationale note under decisions
taken by default. The accumulated list goes back to the user at stage 6, where
the whole draft is under review anyway, and once more at stage 9 if anything is
still open. Batched at a review point, five deferred decisions cost one reply;
raised as they arise, they cost five interruptions and may still go unanswered.

## [0.10.0] — unreleased

**The skill no longer implies it can produce a GitHub submission.** The section
was called "If a GitHub submission is asked for", which read as though a
submission were one of its outputs. It is not, and cannot be: the bundle is a
different artefact from the session file and only the helper builds it,
renaming `parentTechnique` to `parent_technique` and the class lists to
`CASE_input_classes` and `CASE_output_classes`, allocating temporary
identifiers such as `DFT-temp-0001`, and converting each reference to an object
or a bare string depending on whether it carries a `DFCite_id`. There is no
route from a session file to a bundle outside the application.

The section is now "If issue material is asked for", and says three things it
did not say before: that assembling a bundle by hand is not possible and must
not be attempted; that going to GitHub without the helper review is not
recommended, and the skill should say so rather than quietly comply; and that
rationale handed over before that review is provisional, because it records
decisions taken against a draft nobody has looked at yet.

## [0.9.0] — unreleased

**"Never show a bare identifier" now requires the recorded name, copied
exactly.** The rule already said to put an id's name in brackets after it, and
gave its own test: *if you have an id you cannot name, you have not looked it
up*. That test only works on verbatim names. A plausible paraphrase can be
written from a guess, so a paraphrased name proved nothing about whether the
lookup happened, and the rule stopped being a check at all. Not summarised, not
shortened, not tidied into sentence case.

It matters twice over, because the name shown in the conversation is the text
that tends to reach the draft, and a reused mitigation whose text differs from
its recorded name proposes renaming that mitigation everywhere it is used. A
real run produced exactly that: 38 weakness and mitigation names written
lower-case, after which two reused mitigations no longer matched the knowledge
base. `--kb` catches it in the draft, but only after the wording has been
agreed with the user on the strength of a name that was never real.

**The version is now recorded in one place and derived everywhere else.** It
was maintained by hand in five: `SKILL_VERSION` in `package_session.mjs`, the
headers of `SKILL.md` and `references/session-format.md`, the README, and
`package.json`. The README had drifted four bumps behind, to 1.4.4, because
nothing checked it.

- `references/session-format.md` no longer states a version. It restated
  `SKILL.md` exactly, and the version was about the skill rather than about the
  format the file documents.
- `npm run set-version` writes the rest from `SKILL_VERSION` and
  `TARGET_APP_VERSION` in the packager. The packager is the source because it
  is the only one of these files that ships: a skill is distributed as the
  `skills/trwm-draft-submission` folder alone.
- The note in `SKILL.md` claiming the version lives in "three places" and that
  the guarding test is in the helper's suite is gone; neither had been true
  since the repositories split.

**`CONTRIBUTING.md` removed.** The parts about accepting outside contributions
went; the maintenance notes moved into the README under "Working on the skill",
where the person who needs them will look.

## [0.8.0] — unreleased

**Targets TRWM SOLVE-IT Helper 3.7.0**, raised from 3.6.0 after the application
began publishing its session format at
<https://trwm.hargs.co.uk/session.schema.json>. 3.7.0 changed no part of that
format, and the suite that loads packager output into the running application
passes against it. The targeted version is stamped into the `version` field of
every session file the packager writes, so this changes the output.

**An unrecognised key in a draft is now a hard error.** It was silently
ignored, which made a typo into silent data loss: the misspelt key is not read,
whatever it holds is dropped, and the packager reports success. Four cases,
all of which packaged cleanly before this change:

| Written | Consequence before |
|---|---|
| `cause` for `causes` | three causes dropped; six weaknesses became four |
| `mitigation` for `mitigations` in a cause | that weakness lost its mitigations |
| `mitigationDetail` for `mitigationDetails` | every mitigation description, reference and linked technique lost, with no check and no note |
| `reference` for `references` on the technique | the technique's citation lost, silently |

The error names the path and suggests the intended key where one is close:
`weaknesses[0] has an unrecognised key "cause". Did you mean "causes"?` Where
nothing is close it lists what the level accepts instead. Keys beginning with
an underscore are treated as comments and ignored, which is how the shipped
example carries its `_note`.

This is a hard error rather than a check because the alternative is producing a
session file that is structurally valid and missing content the drafter wrote.
The packager already refused a misspelt `errorClasses`, because that key is
required; the change makes the optional keys behave the same way.

**Values are now type-checked too.** `synonyms` given as a string rather than an
array, or a `causes` object where an array of objects belongs, are refused with
the path and both types named.

**`references/draft.schema.json`**, the draft format as a JSON Schema (Draft
2020-12), so an editor or an agent can validate a draft before the packager
runs. It is generated from `DRAFT_SPEC` in `package_session.mjs` — the same
declaration the runtime validator reads — so the schema cannot describe a
different format from the one enforced. `npm run schema` regenerates it and a
test fails if the checked-in file is stale.

The schema was verified against an independent Draft 2020-12 validator: it
accepts the shipped example, accepts underscore-prefixed comment keys, and
rejects each of the four misspellings above at the correct path.

## [0.7.0]

Changes drawn from a real drafting run, the multi-tool verification submission
of 21 August 2026, where the user recorded eighteen corrections they had to make
during the session. Four of those were already fixed by 0.5.0 and 0.6.0; the
rest are here.

**Working files are durable again, reversing part of 0.6.0.** 0.6.0 sent the
draft and rationale to a temporary directory, on the reasoning that a file the
user should not act on should not be in front of them. That conflated two
things. A previous run of this skill was lost entirely when its container was
wiped between sessions, and the technique had to be reconstructed from the
conversation record. The working files now go to a `working/` subdirectory of
the delivery location, written as they are produced. They are still not
delivered and still not listed as outputs; they are simply kept.

**A new stage 6, "Test the causes, then cut."** The stages renumber: mitigations
is now 7, references 8, packaging 9. Both halves of the new stage had to be
asked for by the user rather than offered.

- Every cause needs a concrete scenario, recorded in the rationale note, saying
  what the failure means for the examination. A cause with no scenario is cut
  rather than kept on abstract plausibility.
- Then an explicit pruning pass. Accumulation is the failure mode of stage 5:
  every prompt invites another weakness and nothing invites removal. The skill
  now says outright that a longer weakness list is not a better one, and that a
  marginal cause dilutes the significant ones.

**Three ground rules on how the conversation is conducted.**

- **Put a reviewable set in a table.** Weaknesses, causes, scenarios and
  candidate names arrive many at once, and prose leaves the user unable to
  point at one without quoting it. A table with a label column and a text
  column lets one short reply carry several decisions.
- **Never show a label without its text**, and say that A1 and B2 are drafting
  scaffolding, not `DFW-` identifiers.
- **Decide rather than ask twice.** A question already put and not answered is
  made as a call, stated as a call, and noted as reversible.

**Stage 5, on what makes a cause a cause.**

- A cause gives a reason, not the effect again. The test is whether the text
  after "because" says why the failure happens or describes it a second time.
- Cause text states the mechanism generically; particular observables belong in
  `description` and in the scenario.
- When an effect is recast, re-check the causes already cut against the new
  wording, which is why the cut list is kept in the rationale note.
- Search the existing weaknesses before writing one, and report an absence as
  well as a match. Finding no existing weakness on a subject that many
  weaknesses already prescribe a remedy for is evidence, and it is only
  available if someone looks.

**Stages 3, 7 and 8.**

- Class candidates are presented with a count of how many existing techniques
  use them, and a count of zero is stated outright rather than left as silence.
  A correct, unused class means the submission sets a precedent, which the user
  cannot weigh unless told.
- The mitigation reuse survey is a named step, and the skill now asks what the
  pattern of the results implies, not only which mitigations can be reused.
- A `citation_text` may not be written for a source that has not been read. The
  packager refuses a placeholder id, but nothing stopped a citation string for a
  source only identified, and a relevance summary for an unread source cannot be
  stood behind.
- An empty error class is recorded in the rationale note with the reason it was
  empty, so a reviewer can see it was considered rather than skipped.

## [0.6.0]

A run now delivers one file. Before this, stage 8 opened by saying "a run
produces at least three files" and wrote the draft, the session and the
rationale note side by side. In a real run that arrived as four files with
similar names, only one of which the TRWM helper can load, and the fourth was
a process note the skill never asked for.

- **The session file is the sole deliverable.** The draft and the rationale
  note are written to a working directory outside the delivery location. They
  still exist, so the run stays editable and re-packageable for as long as the
  conversation lasts, but they are not delivered and not listed as outputs.
  The skill says once, at the end, that the draft exists and that it goes when
  the conversation does, and offers to keep a copy.
- **The rationale note now needs asking for.** It is material for a GitHub
  issue, which stage 2 already said, and a GitHub submission is a separate
  request made at a different time. There is a section for it after stage 8.
- **Writing any other file is prohibited.** No summary of what the skill did,
  no notes on the conversation, no process log. Nothing previously forbade it,
  which is how the process note appeared.

`Resuming` now states what follows from this: the draft survives the
conversation and no longer, and there is no way back from a session file to a
draft. Where the draft is gone, the skill says so rather than hand-editing the
session file, whose derived fields have to stay consistent with each other.

## [0.5.0]

Added checks. Before this the packager validated the draft's structure and the
mechanical style rules, and left everything else to the reader.

Four new checks need nothing but the draft:

- **Causes that reduce to the same weakness.** The application merges weaknesses
  with the same name and combines their mitigations. Across results and error
  classes that is the intended behaviour; within one result and one error class
  it is a duplicate, and the cause disappeared with nothing reported. The
  packager already computed the merge, so it now says when one happened and how
  many causes were lost.
- **A cause that does not begin with its effect.** The effect is prepended in
  that case, producing a name that reads as two sentences run together.
- **Two mitigations differing only in punctuation or spacing.** Mitigation
  identity collapses whitespace and case and nothing else, so these stay
  separate and are submitted as two mitigations.
- **Malformed identifiers** in `parentTechnique`, `existingId` and a
  mitigation's linked technique. Shape only; existence is the next group.

`--kb <solve-it.json | url>` adds the checks that need the knowledge base. It is
off by default, so an ordinary run stays offline, dependency-free and
reproducible. It accepts a local path or a URL, including
<https://data.solveit-df.org/solve-it.json>:

- every `DFT-`, `DFM-` and reused id exists, which is the safety net for the
  rule that identifiers come from a lookup and never from memory
- a reused mitigation whose text does not match its recorded name, which
  proposes renaming that mitigation everywhere it is used. This was previously
  a note asking the reader to check by hand; it is now checked
- a new mitigation whose name already exists, which should reuse the id
- a technique or weakness name already in the knowledge base
- a `DFCite-` id that nothing in the knowledge base references, reported as
  something to check rather than as an assertion that the id is wrong, because
  `solve-it.json` records a citation only where something cites it

Where `--kb` has compared a reused mitigation's name, the note stops asking for
that comparison and says it was made.

`--strict` exits 1 if any check is reported. Without it the packager writes the
session and exits 0 whatever it reports, which is unchanged and remains the
default: most checks are omissions for a person to judge rather than errors.

A knowledge base that cannot be read is an error rather than a skipped check, so
a run that tested nothing does not look like a run that passed.

## [0.4.4]

`TARGET_APP_VERSION` raised from 3.4.6 to 3.6.0. This changes the output: the
targeted version is stamped into the `version` field of every session file the
packager writes. Helper 3.6.0 was checked against the packager before the
change, and the application's aggregation, error class list, import path and
export bundle are all unchanged from 3.4.6. The one relevant difference is that
the application's default workflow variant is now TRWM-AC rather than TRWM-A,
which agrees with what the packager already emitted explicitly.

The skill moved to its own repository. Alongside that:

- Stage 8 now names <https://trwm.hargs.co.uk/> when telling the drafter where
  to load the session file. It previously said "open the TRWM helper" without
  saying where it is, which is unhelpful once the skill is installed on its own.
- References to the helper's test files in `session-format.md`,
  `package_session.mjs` and `example-draft.json` no longer describe those tests
  as being in this repository, because they are not. The tests that run the
  packager are here; the ones that load its output into the running application
  stay with the application.

## [0.4.3]

Added the rule that an identifier is never shown on its own. A `DFT-`, `DFW-`,
`DFM-` or `DFCite-` id in anything the user reads now carries its name in
brackets at first mention, because a bare id has to be looked up before the
reader can judge what has been said. Stage 6 was changed to report existing
mitigations with their names as well as their ids for the same reason.

## [0.4.2]

Added `package_skill.sh`, which builds the release archive with the skill
folder at its root and verifies its own output. Packaged the other way round,
with the files loose at the top level, a skill installs into a directory whose
name does not match it and fails to load with nothing in the failure to point
at the cause.

## [0.4.1]

Corrected the reference workflow. The TRWM submission form accepts bare
citation strings, unlike the individual propose-new-technique forms, so a
source that is not yet in the knowledge base can go straight into a draft. A
relevance summary on such a source is still dropped on export, which is now
reported as a check.

## [0.4.0]

Applied the SOLVE-IT style guide. The packager checks the mechanical rules:
sentence case on names, no trailing full stop, and US English spellings with
the British form named where it finds one.

## [0.3.0]

Pasted citations are now checked rather than taken on trust, since they may
come from a reference manager, a preprint, or another model.

## [0.2.0]

Added the references stage.

## [0.1.0]

The first numbered version. The skill existed before this without a version,
and two changes landed in that period: improvements taken from the first real
drafting run, and a fix for the packager silently doing nothing when run
through a symlink, which is how the skill is normally installed into a
`.claude/skills` directory. It exited 0 while writing nothing, which is worse
than an error.
