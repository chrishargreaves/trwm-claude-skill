# TRWM drafting skill

A [Claude](https://claude.com/claude-code) skill that drafts a
[SOLVE-IT](https://solveit-df.org/) knowledge base submission through the
TRWM-AC method, and packages it as a session file that the
[TRWM SOLVE-IT Helper](https://trwm.hargs.co.uk/) can load for review.

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
- **It does not go looking for references.** It cites only sources you name,
  and only after resolving them against a real record. A fabricated citation is
  the one error in a submission that cannot be caught by reading it.
- **At the weakness stage you answer first.** Candidate weaknesses are offered
  only after you have given your own, and are marked as suggestions. Approving
  a list is a weaker act than generating one, and the weaknesses nobody thinks
  of are the reason the method exists.

The skill does not submit anything. Its output is a draft for a person to
review in the application that was built for reviewing it.

## Installing

Download `trwm-draft-submission-<version>.zip` from the
[latest release](https://github.com/chrishargreaves/trwm-claude-skill/releases/latest).
You do not need to clone this repository to use the skill.

### Claude desktop and web

In the skills area, choose **Add → Upload skill**, and select the `.zip`.

### Claude Code

Unzip it into your skills directory:

```bash
unzip trwm-draft-submission-*.zip -d ~/.claude/skills/
```

That gives you `~/.claude/skills/trwm-draft-submission/`. Use
`.claude/skills/` inside a project instead if you want it available only there.

The folder name has to stay `trwm-draft-submission`, because it must match the
`name:` in the skill's front matter. A skill whose folder disagrees with its
front matter fails to load, and the failure does not say why.

### What it needs

- **Node 18 or later**, and nothing else. The skill installs no dependencies.
- **A way to reach the knowledge base**, which is either a
  [SOLVE-IT MCP server](https://github.com/CKE-Proto/mcp_solve-it) or network
  access to <https://data.solveit-df.org/solve-it.json>. Without one of those
  the skill stops before drafting rather than writing a submission that may
  duplicate something.
- **Reachable ontology namespaces**, to confirm a CASE/UCO or SOLVE-IT class
  exists. Where they are unreachable the skill says so and leaves the field
  empty rather than guessing.

## Using it

Ask for it in your own words — "draft a TRWM submission for …", "propose a new
SOLVE-IT technique for …", or point at a document that describes a gap. Claude
invokes the skill and runs the nine stages as a conversation. You can also ask
for it by name.

Expect it to take a while and to ask a lot. The weakness stage puts one error
class at a time for each result the technique produces, which is six questions
per result, and that cost is deliberate — six questions in one message get
skimmed as one. Say so if you would rather have them in batches.

What you get back is a single `<name>-session.json`. Load it into the helper at
<https://trwm.hargs.co.uk/> through **Import from File**, walk the stages there,
revise whatever needs revising, and export the submission bundle from the
application. That review is not a formality: it is the last point at which a
weakness can be cut or a reused mitigation checked before the proposal reaches
other people.

## If a session will not load

A session that does not conform still holds work that took hours, so the
packager explains and mends rather than refusing. Point it at the skill you
installed:

```bash
SKILL=~/.claude/skills/trwm-draft-submission

node $SKILL/package_session.mjs --check  session.json
node $SKILL/package_session.mjs --repair session.json --out fixed.json
```

`--check` reports structural problems and every departure from the schema
published at <https://trwm.hargs.co.uk/session.schema.json>, each with its path.
`--repair` mends only what is derived — an index that must equal its position, a
stale hash, a missing container — reports every change, and keeps everything it
will not guess at, including keys the application drops on import.

Rebuilding a session from memory loses the work; repairing does not.

## Versions

Skill version 0.20.1, targeting TRWM SOLVE-IT Helper 3.8.0, which is the
version currently deployed at <https://trwm.hargs.co.uk/>. The packager stamps
the targeted version into the `version` field of every session file it writes,
so a session file records which application it was written for.

```bash
node ~/.claude/skills/trwm-draft-submission/package_session.mjs --version
```

The version is deliberately below 1.0. The method works and the packager is
well covered, but the skill has had few real runs, and the ones it has had
produced a list of corrections rather than a clean result. Expect the
instructions to change.

## Working on the skill

Building it, testing it, the repository layout and how a release is published
are in [dev_notes.md](dev_notes.md). None of it is needed to install or use the
skill.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
