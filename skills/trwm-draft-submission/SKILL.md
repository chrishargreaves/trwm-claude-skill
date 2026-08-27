---
name: trwm-draft-submission
description: Draft a SOLVE-IT knowledge base submission — a technique, its results, weaknesses and mitigations — through the TRWM-AC method, and package it as a session file that the TRWM SOLVE-IT Helper can import for review and export. Use when (1) the user wants to propose a new SOLVE-IT technique, or says a technique is missing from the knowledge base; (2) the user asks to draft or prepare a TRWM submission, or to build something they can load into TRWM; (3) a document, report or conversation has identified a gap in SOLVE-IT and the user wants it written up; (4) the user wants to revise an existing technique's weaknesses or mitigations for submission. Do NOT use for querying the knowledge base, for editing the SOLVE-IT ontology, or for filing the GitHub issue itself — this skill stops at a reviewable session file.
---

# Draft a TRWM submission

**Skill version 0.17.0.** Targets TRWM SOLVE-IT Helper 3.8.0. Run
`node <skill-dir>/package_session.mjs --version` to check what a given copy
is. Both numbers are set in `package_session.mjs` and copied here by
`npm run set-version` in the skill's repository, so this line is derived rather
than maintained.

This produces a JSON file that loads into the TRWM SOLVE-IT Helper webapp through
**Import from File**. The user then walks the stages in the application,
revises whatever needs revising, and exports the submission bundle from there.

The skill does not submit anything. Its output is a draft for a person to
review in the tool that was built for reviewing it.

## What TRWM is, briefly

TRWM works through a digital forensic **T**echnique by asking what
**R**esults it produces, what **W**eaknesses each result can have, and what
**M**itigations reduce those weaknesses. This skill uses the **TRWM-AC**
variant, which splits each weakness into an *effect* — what goes wrong — and
one or more *causes*, so that mitigations can attach per cause. Two causes of
the same effect normally need different remedies, and that distinction is lost
if the weakness is recorded as one statement.

Weaknesses are found by working through six ASTM error classes, listed in
`references/session-format.md`. The classes are prompts, not a taxonomy to fit
answers into: their purpose is to make a person consider failures they would
not otherwise have reached.

## Ground rules

**Do not invent knowledge base content.** Every CASE/UCO class IRI, every
`DFT-`, `DFW-`, `DFM-` and `DFCite-` identifier must come from a lookup, not
from memory. If a lookup is unavailable, say so and leave the field empty
rather than guessing.

**Never show a bare identifier.** A `DFT-`, `DFW-`, `DFM-` or `DFCite-` id on
its own tells the reader nothing — they have to go and look it up before they
can judge what has been said, which is exactly the friction the drafting
conversation is supposed to remove. Every time an id appears in something the
user reads, put its name in brackets immediately after it, at its first mention
in that message:

> DFT-1001 (Triage devices or media)
> DFM-1001 (Review of all triage results that are relied on during the full
> digital forensic examination)

This holds wherever ids are reported: the nearest existing techniques and the
structural precedent at stage 1, class precedents at stage 3, existing
mitigations offered for reuse at stage 7, citations at stage 8, and the
packager's `check:` and `note:` lines at stage 9. If you have an id you cannot
name, you have not looked it up — look it up, or do not cite it. The draft JSON
is the only exception, because its fields hold ids by definition.

**The name is the recorded one, copied exactly.** Not summarised, not
shortened, not tidied into sentence case, not reconstructed from what the
entry is about. Paste what the lookup returned, however long and however
awkwardly it reads:

> DFM-1027 (Use dual tool verification)          ← the recorded name
> DFM-1027 (dual tool verification)              ← wrong: re-cased and trimmed
> DFM-1027 (verify using two tools)              ← wrong: a paraphrase

This is not pedantry about presentation, and it is the part of the rule most
easily lost, because a paraphrase reads perfectly well. Two things depend on
it.

**It is what makes the rule detect anything.** "If you cannot name it you have
not looked it up" only holds for verbatim names. A plausible paraphrase can be
produced from a guess, so a paraphrased name proves nothing about whether the
lookup happened, and the rule stops being a check at all.

**A paraphrase in the conversation becomes a rename in the submission.** The
text you show is the text that tends to reach the draft, and a reused
mitigation whose text differs from its recorded name proposes renaming that
mitigation everywhere it is used — see "Never rename an existing mitigation" at
stage 7. Running the packager with `--kb` catches this in the draft, but only
after the wording has already been agreed with the user on the strength of a
name that was never real.

**Produce one file.** A run delivers the session file and nothing else. The
draft and the rationale note are working files. They are kept, durably, but
they are not delivered and not listed as outputs — see stage 9. Do not write any other file:
no summary of what the skill did, no notes on the conversation, no process
log. A drafting run that hands back four files makes the user work out which
one to load, and only one of them can be loaded.

The exception is the **rationale note**, which the user has to ask for, and
which is material for a GitHub issue rather than a submission — the submission
bundle comes out of the helper, not out of this skill. See "If issue material
is asked for" after stage 9.

**Put a reviewable set in a table.** The stages that need most from the user —
weaknesses, causes, scenarios, mitigations, candidate names — produce many
discrete items at once, and prose does not work for them. A paragraph per cause
over several paragraphs leaves the user unable to point at one without quoting
it, and answering twelve propositions means writing twelve replies. A table
gives one row per item, so a single short reply can carry several: *"drop A5,
B2 is not convincing, generalise the D variations"*.

Give the table a short label column and a text column. The label makes an item
addressable; the text makes the label mean something. **Never show a label
without its text**, and say when you first use them that A1 and B2 are drafting
scaffolding invented for this conversation, not `DFW-` identifiers.

Prose is right for a single proposition, or for an argument about one decision.
It is wrong for a list of things to be reviewed.

**Ask at most twice, then decide — and keep the question.** A question that
goes unanswered may be put once more, worded differently in case the first
attempt was the problem. After that, stop asking: make the call, say which way
you went, why, and that it is reversible in one line. A question repeated
across three turns costs the user more than a decision they can overturn.

Deciding is not the same as settling, so **record every call made this way in
the rationale note**, under a heading for decisions taken by default. Then put
the accumulated list back to the user twice: at stage 6, where the whole draft
is being reviewed anyway, and again at stage 9 before packaging if anything is
still open. Batched at a review point, five deferred decisions cost one reply;
raised one at a time as they arise, they cost five interruptions and still may
not get answered.

**Do not put words in the user's mouth.** The weakness stage in particular is
the part of the method that has to be done by the person, not for them. Follow
the sequencing in stage 5.

**Do not go looking for references, at any stage.** Cite only sources the user
names, and only after resolving them against a real record. See stage 8 for
what is permitted. A fabricated citation is the one error in a submission that
cannot be caught by reading it.

**Leave `technique.id` as `DFT-XXXX`.** The export bundle converts it to a
temporary identifier, and the SOLVE-IT repository's own scripts allocate the
real one.

## Where this skill is running

Establish this before stage 1, because two later instructions depend on it and
one of them cannot be satisfied everywhere.

The skill needs a Node runtime — `node <skill-dir>/package_session.mjs` — and
somewhere to put files. Both exist in the environments it has been run in,
including the browser and desktop applications, where the packager has run and
caught problems a hand-rolled check missed. Where `node` is genuinely absent,
say so at stage 1 rather than at stage 9: the draft is still worth writing, but
you will not be able to package it, and the user needs to know that before
spending an hour on it.

**What differs is whether the filesystem survives.** Two cases:

- **A real filesystem** — a working copy on the user's machine. Files written
  anywhere sensible persist. `working/` beside the delivery location is
  durable, and that is the end of it.
- **An ephemeral container** — the browser and desktop applications. The
  filesystem is wiped between sessions, and **no path in it is durable**. A
  previous run of this skill was lost entirely this way, and the technique had
  to be reconstructed from the conversation record.

In the second case, "write it somewhere durable" is not an instruction that can
be followed. Durability means getting the file out: handing it to the user, or
writing to connected storage such as a synced folder, if one is available.

So in an ephemeral environment, and only there, **offer the working files at
the end** — after the session file, in a separate sentence, described as
working files to keep or discard rather than as results. That is not a
contradiction of "produce one file": there is still one deliverable, and the
rest are offered as the only means of saving them. Say plainly that they go
when the session does if the user declines.

Do not do this where the filesystem is real. There the files are already safe,
and offering them is what turns one deliverable into four.

## Reaching the knowledge base

In order of preference:

1. **The SOLVE-IT MCP server**, if tools named `solveit_search`,
   `solveit_get_technique` and similar are available. Preferred.
2. **The public compiled data**, otherwise:
   `https://data.solveit-df.org/solve-it.json` (also available as
   `solve-it.ttl`). Both are rebuilt daily.

If neither is reachable, stop and say so before drafting. A submission written
without checking what already exists is likely to duplicate something.

## Reaching the ontologies

The knowledge base answers *which techniques already use this class*. The
ontologies answer *does this class exist and what does it mean*. Both are
needed at stages 3 and 4, and they are different sources.

**To check an IRI exists, fetch it.** All three namespaces resolve a real
class and return 404 for one that does not, so dereferencing is a real test
rather than a formality:

- `https://ontology.unifiedcyberontology.org/uco/…` — UCO
- `https://ontology.caseontology.org/case/…` — CASE
- `https://ontology.solveit-df.org/solveit/…` — SOLVE-IT

Each serves human-readable documentation for the class, so the same fetch that
proves the IRI exists also tells you what it means. Do this for every IRI
before offering it: a plausible-looking IRI that resolves to nothing is worse
than an empty field, and a 404 is the only reliable way to catch one.

**To search for a class you cannot yet name**, read the sources:

- SOLVE-IT: the ontology is split across modules in
  <https://github.com/SOLVE-IT-DF/solve-it-ontology> — `solve_it_core.ttl`,
  `solve_it_observable.ttl`, `solve_it_analysis.ttl` and others named for what
  they cover. There is no single combined file, and
  `ontology.solveit-df.org` publishes documentation rather than Turtle.
- UCO and CASE: the Turtle sources in <https://github.com/ucoProject/UCO> and
  <https://github.com/casework/CASE>, under `ontology/`.
- `ontology.solveit-df.org` also lists every SOLVE-IT class as a page, which
  is quicker than reading Turtle when you are browsing rather than searching.

**Report the version you checked against** where it matters. Dereferencing a
UCO IRI returns documentation generated for a specific release, and a class
added recently will not exist for someone on an older one.

If the ontologies are unreachable, say so and leave the class fields empty
rather than writing an IRI you could not verify. An empty field is a visible
gap; a wrong IRI is not.

## House style

SOLVE-IT has a written style guide, and it is authoritative. Fetch it at
stage 1 and follow it:

<https://raw.githubusercontent.com/SOLVE-IT-DF/solve-it/main/STYLE_GUIDE.md>

The summary below is a working extract, kept so the skill still applies the
rules offline and so the packager can check the mechanical ones. **Where the
fetched guide differs from this summary, the guide wins** — say so, and note
that this file needs updating. Summary taken 2026-08-12.

**US English throughout.** This is the rule most easily lost, because the
drafting conversation is often in British English and the drafter may write
that way by default. It is "artifact", not "artefact". The packager checks a
list of common pairs, but the list is not exhaustive.

**Sentence case for every name** — technique, weakness and mitigation.
Capitalise the first word and proper nouns only. Names do **not** end with a
full stop. Every one of the 191 techniques, 358 weaknesses and 285 mitigations
in the knowledge base begins with a capital, so there is no ambiguity here.

**Technique names** begin with a present-tense imperative verb, and must pass
the investigator test: *"As an investigator, I want to [technique name]…"*
should make sense read aloud.

**Weakness names** describe what can go wrong, not what to do about it — an
action-oriented name is a mitigation, not a weakness. Where possible name both
the problem and its cause, which is what the effect-and-cause split produces
naturally. The test is: *"As an investigator, I am concerned that [weakness
name]"*. A well-named weakness suggests a mitigation on its own; if it does
not, the cause is probably not specific enough.

**Mitigation names** are action-oriented imperative phrases, detailed enough
to stand without reading the weakness. The test is: *"As an investigator, I
can [mitigation name] to reduce this risk"*.

**Descriptions** are one or two sentences in active voice. A technique
description is typically 15–30 words and often uses the "The process of…"
construction; `details` runs longer, 40–100+ words, and covers practical
considerations and relationships to other techniques by id. Weakness
descriptions avoid naming specific tools.

Apply the investigator tests as you draft, not as a check at the end. They are
quick and they catch a badly-shaped name before weaknesses are hung off it.

---

## Stage 1 — Scope

Establish that there is something to propose.

1. Search the knowledge base for the proposed technique, using several
   wordings. Search techniques, weaknesses and mitigations.
2. Report the nearest existing techniques and, for each, one sentence on why
   it does or does not already cover the proposal.
3. **Look for a structural precedent** — a technique of the same *shape*
   rather than the same subject. If the proposal recovers an
   operating-system-level mapping held in different stores on different
   platforms, find an existing technique that does the same and read its
   record: how it is named, whether it uses `details` to declare a term that
   unifies the platforms, and how its weaknesses are decomposed. Follow it.
   This is where the knowledge base pays back its own growth — the more
   techniques exist, the better the available model — so do it even when the
   subject matter is unlike anything already recorded.
4. Ask the user to confirm the gap is real before going further.

If the proposal turns out to be an existing technique needing extension rather
than a new one, say so. The skill still works — draft against the existing
technique's id and content instead of `DFT-XXXX`.

Where the request comes from a document, read the document first and bring
what it already settles into this stage rather than asking again.

## Stage 2 — Brainstorm

Short and conversational, not a form. Establish:

- What the technique does, in the terms a practitioner would use.
- Its boundary: what is inside it and what belongs to a neighbouring
  technique. Name the neighbours found in stage 1.
- What it takes as input and what it produces, in ordinary language. Classes
  come later.
- Whether it is a technique in its own right or a sub-technique of something
  existing.

Ask about anything genuinely undetermined. Do not ask about things the source
document or the earlier conversation has already settled.

Start a companion markdown file recording the reasoning: what the technique
is, what it was distinguished from, and why. Write it in the `working/`
directory described at stage 9, not beside the session file. It is not part of
the session file and it is not a deliverable; it is material for a GitHub
issue, which is a separate request.

Keep adding to it as later stages settle things. A scope decision taken at
stage 4, a structural precedent followed from stage 1, or an effect split in
two at stage 5 because its causes needed different error classes are all
reasoning a reviewer will ask about, and all of them are decided after this
stage. Record the decision at the point it is taken.

## Stage 3 — T, the technique record

Fill in the `technique` block of the draft:

- `name` — a verb phrase, matching the style of existing techniques. Check
  several real names before writing one.
- `description` — one or two sentences on what the process is.
- `details` — longer prose where the description is not enough. Optional.
- `synonyms`, `examples` — optional; examples are usually tool names or
  concrete artefacts.
- `inputClasses` — CASE/UCO or SOLVE-IT IRIs. See "Choosing classes" below.
- `parentTechnique` — a `DFT-` id, only if this is genuinely a sub-technique.

Show the block to the user and take corrections before moving on.

### Choosing classes

This applies to input classes here and to output classes at stage 4. Never ask
the user to choose a class from an open field — present candidates with the
evidence for each, so the choice is made against precedent rather than
recollection.

Draw candidates from two places, and say which is which:

1. **Existing techniques.** A class already used by a neighbouring technique
   for the same kind of thing is the strongest candidate, because it keeps the
   knowledge base internally consistent. Name the techniques that use it.
2. **The ontologies themselves** — CASE/UCO and SOLVE-IT. A class may be right
   and simply not used yet. Search the ontology when the existing techniques
   offer nothing that fits — see "Reaching the ontologies" above for where —
   and say plainly that the class has no precedent in the knowledge base so
   the user can weigh that.

Present each candidate as: the IRI, what it means, and **how many of the
existing techniques already use it**. Then recommend one. Verify every IRI
exists before offering it — a plausible-looking IRI that resolves to nothing is
worse than an empty field.

The count matters as much as the existence, and a count of zero must be stated
outright rather than left as silence. A class that is real, correct and used by
none of the techniques in the knowledge base means this submission sets the
precedent for it, and the user cannot weigh that unless they are told.

Properties as well as classes are acceptable where existing practice uses
them: several techniques declare datatype properties among their
`CASE_output_classes`. Check whether the neighbours do before deciding.

## Stage 4 — R, the results

A result is a distinct kind of output the technique produces. Most techniques
have one or two.

For each result, record a name, a description, and its CASE output class IRIs,
chosen as described under "Choosing classes" above.

### Test each proposed result before asking for approval

Splitting one output into several results because it has several parts is the
common error here, and it is not always obvious which side of the line a
candidate falls. Put each proposed result past two questions, and put the
answer to the user rather than deciding silently:

- **Is it one end of a relationship the technique already records?** An
  association between a file type and an application is a relationship; the
  application is one end of it. Recording the application as its own result
  enumerates something the first result already contains.
- **Is it a subcomponent of an output already described?** A field, an
  attribute, or a part of a structure is usually not a result in its own
  right, even when extracting it can fail in ways the parent cannot.

Neither question settles it — whether to split is genuinely debatable, and a
part that fails in its own ways can deserve its own result and its own
weaknesses. The point is that the question is asked and answered before the
list is approved, not discovered afterwards.

Say so explicitly when asking for approval: **the result list fixes the shape
of the weakness stage.** Removing a result later means the weaknesses written
against it have to be reassigned or discarded, so it is worth a moment now.
Do not announce a total number of prompts for stage 5 until the list is
settled.

## Stage 5 — W, the weaknesses

This is the stage that carries the method, and the sequencing matters.

### Error classes describe the effect, not the cause

State this before the prompts begin, because it shapes how weaknesses are
decomposed and it is expensive to discover halfway through.

An error class characterises **what goes wrong** — information missed,
something reported that is not there, things wrongly grouped, a result that
invites misreading. That is the effect. A cause is a *reason* the effect
happens, and reasons do not have error classes of their own: a weakness caused
by a tool defect and one caused by an examiner's omission are the same kind of
error, arrived at differently.

So the classes are recorded once per effect and every cause derived from it
inherits them. The format enforces this — the helper computes the class list
from the effect's slot and reuses it for each cause — but the reason it is
right is the one above, not the implementation.

The working rule: **if two causes need different error classes, they are
causes of different effects.** When that happens, do not force them together
and do not duplicate the same effect text. Look for the decomposition hiding
behind it — usually the effect has been stated too broadly and splits into two
genuinely different failures. Propose the split, name each effect for what
distinguishes it, and record why in the companion note.

### The prompts

For each result, and then for each of the six error classes in turn:

1. **State the prompt** — the error class, and the question it asks (the table
   in `references/session-format.md`).
2. **Ask the user what can go wrong** with this result, under this class.
   Wait for their answer.
3. **Only after they have answered**, offer any candidates they did not
   mention, clearly marked as suggestions, with a note on where each came from
   — a weakness recorded against a neighbouring technique, something in the
   source document, or an inference. The user accepts, rejects or rewrites.
4. If a class genuinely yields nothing, record that and move on. An empty
   class is a legitimate result — but write in the rationale note *why* it was
   empty, in one line. A reviewer needs to see that the class was considered
   and excluded, which an absent entry does not show.

Offering candidates before the user has answered defeats the purpose of the
prompts: approving a list is a weaker act than generating one, and the
weaknesses nobody thinks of are the reason the method exists.

**Search the knowledge base before writing a weakness.** For each effect, look
through the existing weaknesses for the same substance, not the same wording.
Two outcomes, both worth reporting:

- **Something matches.** Say so with its `DFW-` id and name. The submission may
  be better as a reuse than as a new weakness.
- **Nothing matches.** Say that too, and say what you searched for. An absence
  is evidence: finding no existing weakness about shared libraries or shared
  assumptions, across dozens of weaknesses that prescribe dual tool
  verification as their remedy, is the strongest argument a submission of this
  kind can carry, and it is only available if someone looks.

**Then split each effect into causes.** Here you may be more forthcoming —
decomposing a stated effect into its reasons is closer to mechanical than
generative. For each effect, propose the causes you can see, and ask what is
missing. Write each cause as a complete sentence beginning with the effect
text:

> effect: *the set of associations is incomplete*
> cause: *the set of associations is incomplete because per-user associations were not examined*

**A cause gives a reason, not the effect again.** The common failure is a cause
that restates the effect in different words: *"the outcome covers only part of
the output"* with the cause *"only selected aspects were compared"*. Apply the
test to every cause before offering it — does the text after "because" say
*why* this happens, or does it describe the same failure a second time? A cause
that paraphrases back into its effect is not a cause, and the two will merge
into one weakness anyway.

**State the mechanism generically.** Cause text that names particular
observables — timestamps, paths, text encodings — narrows the weakness to those
instances. Write the mechanism, and put the instances in the cause's
`description` and in the scenario recorded in the rationale note.

**When an effect is recast, re-check what was cut.** Rewording an effect
changes what falls under it, and a cause dropped against the old wording can
belong under the new one. Keep the cut causes in the rationale note for exactly
this reason, and go back through them whenever an effect changes.

Record which error classes apply to each weakness. The first listed decides
where the slot is filed; the rest are recorded alongside it.

## Stage 6 — Test the causes, then cut

This stage exists because both halves of it had to be asked for by the user
rather than offered. Do not fold it into stage 5 and do not treat it as a
review at the end: a cause that cannot survive this is a cause that should
never reach a mitigation.

### Every cause needs a scenario

For each cause, write a concrete scenario in which it actually happens, and put
it in the rationale note. A scenario does not need to name a real tool. It
needs to be convincing as something that could occur, and it has to say what
the failure means for the examination — what the investigator ends up
believing that is not true.

Put the scenarios to the user in a table, one row per cause, and ask which are
convincing. Cut any cause with no scenario, rather than keeping it because it
is plausible in the abstract. Record the cut and its reasoning in the note:
stage 5 says to re-check the cut list whenever an effect is recast, and that
only works if the list is written down.

### Then prune for signal

Accumulating is the failure mode of the previous stage. Every prompt invites
another weakness, nothing invites removal, and the result is a long list in
which the serious problems sit among marginal ones.

Say this to the user plainly: **a longer weakness list is not a better one.**
Offer the full set in a table and ask what should go. A defensible but marginal
cause dilutes the significant ones, and the reader of the finished knowledge
base entry has no way to tell which is which.

The judgement is the user's. Your part is to make the offer, and to name the
causes you would cut yourself and why.

### And put back the decisions you took alone

Before leaving this stage, list the calls recorded in the rationale note under
decisions taken by default — the questions that went unanswered and were
settled so the drafting could continue. One line each: what was asked, which
way you went, and why. The user overturns what they want to overturn.

This is the point in the run where that list is cheapest to review, because
the whole draft is in front of them anyway. Anything still open at stage 9
gets one more mention before packaging, and no more than that.

## Stage 7 — M, the mitigations

For each cause, ask what would reduce it.

**Start with a reuse survey, as a step in its own right.** Before proposing
anything new, search the knowledge base for existing mitigations covering the
same ground and offer those, with their `DFM-` ids **and their names**, so the
submission reuses rather than duplicates. This is the stage that reports the
most ids, and an offer the user cannot read is an offer they cannot accept.

**Then say what the pattern of what you found implies.** The survey produces
more than a list of candidates. If every existing mitigation on a subject
prescribes *applying* a technique and none addresses that technique failing,
that is a structural gap, and it is an argument for the submission rather than
a fact about it. Report the shape of the results, not only the matches.

A mitigation used against several causes should be written with identical text
each time. The packager matches on normalised text, so consistent wording is
what makes it one mitigation rather than several.

Where a mitigation is itself performed by an existing technique, record that
technique's id in `mitigationDetails`.

### Never rename an existing mitigation

When reusing a mitigation, put its `DFM-` id in `existingId` and **copy its
name from the lookup, character for character**, into `text`.

The export pairs the id you supply with the text you supply. Reworded text
against a real id does not create a new mitigation — it proposes renaming that
mitigation everywhere it is used in the knowledge base, silently, as a side
effect of a submission about something else. Nothing in the bundle marks it as
a rename.

If the existing wording genuinely seems wrong, that is a real observation, but
it is not this submission's business. Keep the name as it is, and record the
concern in the companion note instead: which mitigation, what seems wrong with
it, and which weaknesses in this draft are relying on it. That surfaces the
issue for a separate decision rather than smuggling it through.

If no existing mitigation fits closely enough to reuse under its own name,
write a new one and leave `existingId` empty. A new mitigation is a normal
outcome; a quietly renamed one is not.

## Stage 8 — References

Citations are optional, and a submission without them is still a submission.
But a technique record, and any weakness whose existence rests on published
work, are stronger for carrying one, and the field exists on all three of
technique, weakness and mitigation.

**Do not go looking for references.** Not in this stage and not anywhere else
in the skill. Ask the user whether there is anything they want cited, offer
the places a citation would carry weight, and take what they give you. A model
asked to find supporting literature produces plausible citations, and a wrong
`DFCite` entered into the knowledge base is worse than an absent one, because
it propagates to everyone who reuses the technique.

Resolving a source the user has *named* is a different act and is permitted:
there is a right answer and it can be checked.

### The only three ways a citation may reach the draft

1. **It is already in the knowledge base.** Check first, every time — use
   `solveit_list_citations` and `solveit_get_citation`, or search the compiled
   data. If it is there, use its `DFCite_id` and nothing else; do not restate
   the citation text.
2. **The user pasted BibTeX**, or a full citation. Use it as given, and keep
   the form they gave it in — the knowledge base holds both raw BibTeX entries
   and prose citations, so there is nothing to convert. Then check it, as
   below.
3. **The user named a source and it resolved against a real record.** A DOI, a
   title with an author, a URL. Resolve it, show the user what you matched, and
   let them confirm it is the right thing. If nothing resolves, say so and
   stop. Do not fall back on what the citation probably says.

Anything reconstructed from memory is prohibited, including a citation you are
confident about. Confidence is exactly the failure mode.

**Do not write a `citation_text` for a source you have not read.** The packager
refuses a placeholder `DFCite-` id, but nothing stops a citation string being
written for something only identified. A reference carries a relevance summary,
and a summary for an unread source cannot be stood behind. Where a source ought
to be cited but has not been read, record it in the rationale note as a pending
addition and leave it out of the draft.

### Checking a citation

A pasted citation is checked too, not taken on trust. It may have come from a
reference manager, or from a preprint, or from another model. Checking is
cheap and catches the wrong year, a stale preprint against the published
version, or a URL that no longer resolves.

What to check depends on what the source is. Most SOLVE-IT citations are not
journal articles — roughly two in five carry a URL and only a handful carry a
DOI:

- **A DOI is present.** Resolve it and compare title, first author and year
  against what was pasted.
- **An academic work with no DOI given.** Search for the title with the first
  author. If something matches, show the user the record and the DOI and ask
  whether it is the same work. Do not assume it is.
- **A web source** — tool documentation, a vendor page, a repository file, a
  standard. Fetch the URL, confirm it resolves and that the page is what the
  citation says it is. Existing entries carry a year for these, so establish
  one.

Three outcomes, all of them acceptable, all recorded in the companion note so
a reviewer can see which citations were machine-checked and which were not:

- **Verified** — say what was checked and against what.
- **Discrepancy** — report each difference and let the user decide. **Never
  silently correct their citation.** A year that disagrees may mean the
  preprint and the published version are different works, which is their call.
- **Unverified** — no record found, no network, or a source that has none.
  This does not block anything. A paywalled standard such as ASTM E3016-18 has
  no free record, and the knowledge base already cites sources of that kind.
  Say plainly that it could not be checked.

Where a check establishes a DOI or URL the citation was missing, **add it**.
The style guide asks for Harvard style including author, year, title,
publisher or journal, and the URL or DOI where available:

- Academic: `Author, A., Author, B., Year. Title. Journal, Volume, pages. DOI/URL`
- Online: `Organization/Author (Year), Title, URL`

BibTeX is the preferred form where you have it, and it is stored as given.

### Choosing what to cite

The style guide sets three rules worth applying while drafting rather than
afterwards:

- **Selectivity.** A reference must have a meaningful implication. Does it
  explain the technique, evidence the weakness, or support the mitigation? Do
  not cite something merely because it mentions the topic.
- **Primary sources.** Cite the original work rather than a survey that
  references it, unless the survey genuinely adds a comparison or synthesis of
  its own.
- **Placement.** A source supporting the technique's definition belongs on the
  technique; one evidencing a weakness belongs on that weakness; one
  describing a mitigation belongs on the mitigation.

For a large source — a book, a long paper — put the page, chapter or section
in the relevance summary so a reader can find the passage.

### How references reach the knowledge base through this route

**A new source does not need its own issue first.** The style guide says the
issue forms accept `DFCite` ids only, and that is true of the individual
propose-new-technique, -weakness and -mitigation forms. It is **not** true of
the TRWM submission form, which is the route a bundle from this skill takes.
`parse_trwm_submission.py` resolves bare-string references itself: it
strict-matches each one against the existing citation corpus by URL, DOI, or
normalised title with first-author surname and year, and either rewrites it to
the real id or allocates a `DFCite-____-N` placeholder and shows the reviewer
the original text with near-miss candidates. So a citation the user has that is
not yet in the knowledge base can go straight into the draft.

Give BibTeX where you have it. It is what the reviewer sees in the preview
comment's "new references to review" section.

**But a relevance summary does not survive on a new source.** This is worth
knowing before writing one. The helper's export drops it — a reference with no
`DFCite_id` exports as a bare citation string and nothing else — and the parser
then sets `relevance_summary_280` to empty even for the bare strings it
successfully auto-links. So:

- If the source is already in the knowledge base, **find its `DFCite_id` and
  use it.** That is the only path on which a relevance summary reaches the
  submission. Always check before treating a source as new.
- If it is genuinely new, still write the relevance, but put it in the
  companion note rather than the draft, flagged as needing to be applied once
  the reference has a real id — through the issue body, or later through the
  "update DFCite relevance" form. A reference with no summary appears faded in
  the Explorer, so this is a loose end worth recording rather than losing.

**Inline citations are available.** A specific claim inside `description`,
`details` or `examples` can cite a source directly with `[DFCite-xxxx]`, which
renders as a link in the Explorer. This is in addition to listing the source
in the item's references with a relevance summary, not instead of it. It needs
a real id, so it is only available for sources already in the knowledge base.

### Relevance summaries

`relevance_summary_280` says why the source is being cited, in 280 characters
or fewer. Existing entries are specific — they name the section or figure that
carries the point — so the bar is a summary written by someone who has read
the thing.

Only two bases are acceptable, and you must say which applies:

- **The user supplied the substance.** Write it up in their terms.
- **You read the source.** Say what you read — abstract, or the full text. An
  abstract supports a general statement of what the paper is about, and not a
  claim about what section 4 says.

If neither holds, leave `relevance_summary_280` empty. An empty summary is
honest; an invented one asserts something about a real author's work.

**Prefer the user's wording even where you have read the source, and say so.**
A summary you generate is a summary of what the source is *about*. A relevance
summary has to say why it is being cited *here*, against this technique or this
weakness — and those are different things. Judging which paragraph, section or
figure carries the point needs to know which claim in the submission the source
is supporting, and that judgement sits with the person making the claim.

So a summary you write is a draft, not an answer. Offer it as one: show it,
say what you read to produce it, and say plainly that it is likely to be less
precise than one the user writes, and may pick out the wrong part of the
source. Take their correction. Where they do not want to write one, keep yours
only if they have read it and accepted it.

This is the field most likely to look finished while being wrong. A summary
that names the wrong section is harder to catch than an empty one, because it
reads exactly like a summary that names the right one, and it stays in the
knowledge base for everyone who reuses the entry.

### Where they attach

- `technique.references` — the source for the technique as a whole.
- `causes[].references` on a weakness — each cause becomes its own weakness,
  so the citation attaches to the cause, not the effect.
- `mitigationDetails[].references` — matched to the mitigation by its text.

A citation already in the knowledge base needs only
`{ "DFCite_id": "DFCite-nnnn", "relevance_summary_280": "..." }`. A new one
needs `citation_text`, and exports as a plain string for a maintainer to match
later. Do not invent a `DFCite-` id for a new source.

## Stage 9 — Package

1. **Propose a location for the session file before writing anything.** One
   file is delivered, `<name>-session.json`, and an exported bundle joins it
   later. Do not drop it into whatever directory the conversation happens to
   be running in; a workspace root that collects several repositories is a
   particularly poor choice. Say where you propose to put it and take the
   user's answer.

   The draft and the companion note are working files. Write them to a
   `working/` subdirectory of that same location, as `<name>-draft.json` and
   `<name>-rationale.md`. They are not delivered and are not listed as
   outputs.

   Whether that makes them safe depends on where you are running — see "Where
   this skill is running" at the top. On a real filesystem it does. In an
   ephemeral container it does not, and the working files have to be offered
   at the end if they are to survive at all. Not delivered and not saved are
   different things, and only the first is ever wanted.

   Write them as they are produced, not at the end. An interrupted run should
   leave a draft that matches how far it got.

   Say once, at the end, where the working files are, in a single line. Do not
   list them as though they were results.

2. **Fill in `rationale` in the draft.** The session format carries a
   free-text `rationale` field, and the helper puts it into the exported
   bundle under `provenance`, so what you write there travels with the
   submission rather than sitting in a file beside it that can be lost.

   It is a condensed form of the rationale note, not a copy: what the
   technique was scoped to and what was excluded, the causes cut at stage 6
   and why, the error classes considered that came to nothing, and any
   decisions taken by default that the user did not overturn. A few sentences
   to a few paragraphs. The note stays as the full record.

3. Run the packager, giving it the knowledge base so it can check the
   identifiers you used:

   ```bash
   node <skill-dir>/package_session.mjs <dir>/working/<name>-draft.json \
     --out <dir>/<name>-session.json \
     --kb https://data.solveit-df.org/solve-it.json
   ```

   The input comes from `working/` and the output goes beside it, one level
   up. That is what keeps the draft out of the delivered result while keeping
   it on disk.

   Use a local copy of `solve-it.json` instead where you have one. Without
   `--kb` the packager still runs every check that does not need the knowledge
   base, but it cannot tell an invented identifier from a real one, so give it
   the knowledge base whenever you can reach it.

   **Fetching that URL is a different capability from reaching the knowledge
   base at stage 1.** If you got there through an MCP server, the packager may
   still have no outbound network, and a `--kb` it cannot read is a hard error
   that writes nothing — deliberately, because a run that silently skipped
   those checks would look like a run that passed them. Where the fetch fails,
   save a copy of `solve-it.json` and point `--kb` at the file; where you
   cannot, run without `--kb` and **say in your report that the identifier
   checks did not run**. An absent check the user knows about is a different
   thing from one they assume happened.

4. Report what it prints, distinguishing the two kinds of line:

   - `check:` — a problem. Not fatal, but a weakness with no mitigation or a
     result with no output class is usually an omission rather than a
     decision. Put each to the user. Four of them describe silent losses, and
     are worth acting on rather than accepting: causes that reduce to the same
     weakness and merge, a cause that does not begin with its effect, two
     mitigations differing only in punctuation, and, under `--kb`, a reused
     mitigation whose text does not match its recorded name.
   - `note:` — something to confirm rather than fix, such as a mitigation
     being reused under an existing `DFM-` id. Show these and let the user
     check them; do not treat them as errors.

5. Tell the user the one file is ready, and how to load it: open the TRWM
   helper at <https://trwm.hargs.co.uk/>, choose **Import from File**, choose
   the file, and confirm the session name. Name the session file and nothing
   else. Listing the working files here is what makes a one-file result look
   like a four-file result.

If a session ever fails to load, or one turns up from an older run, diagnose
it rather than rebuilding it: `--check <session.json>` names every problem with
its path, and `--repair <session.json> --out <fixed.json>` mends what is
derived and reports what it will not guess, keeping everything it cannot mend.
Rebuilding from memory loses the work; repairing does not.

If the user wants changes, edit the draft in the working directory and
re-package. Do not edit the session file: it holds derived fields that must
stay consistent with each other, and hand-editing one of them breaks the
others silently.

## If issue material is asked for

**You cannot produce a submission bundle, and should not try.** The bundle that
goes to GitHub is a different artefact from the session file, and only the
helper builds it: it renames `parentTechnique` to `parent_technique` and the
class lists to `CASE_input_classes` and `CASE_output_classes`, allocates
temporary identifiers of the form `DFT-temp-0001`, `DFW-temp-0001` and
`DFM-temp-0001` for everything not already in the knowledge base, and converts
each reference to an object or a bare string depending on whether it has a
`DFCite_id`. There is no route from a session file to a bundle outside the
application. Anything assembled by hand would look like a submission and not
be one.

**Going to GitHub without the review is not recommended, and say so.** The
route is: import the session file, walk the stages in the helper, revise, and
export the bundle from there. That review is not a formality. It is where a
person sees the whole draft laid out rather than arriving stage by stage in a
conversation, and it is the last point at which a weakness can be cut or a
reused mitigation checked before the proposal reaches other people.

What you can hand over is the **rationale note**, which is material for the
issue body and not the submission. Only when asked. It is the file kept in
`working/` since stage 2, so this is a copy rather than new work: deliver it as
`<name>-rationale.md` beside the session file and say what it is.

If it is asked for before the helper review has happened, hand it over and say
plainly that it is provisional — it records decisions taken against a draft
nobody has reviewed yet, and the review is the thing most likely to change
them.

## Resuming

The draft JSON is the working state, and it is written to durable storage as
the run proceeds. If a run is interrupted, read the existing draft, report
which stages are complete — a stage is complete when its part of the draft is
populated — and continue from the first that is not.

The rationale note is the other half of that state, and carries what the draft
cannot: the causes cut at stage 6 and why, the scenarios, the error classes
considered and come to nothing, and the decisions taken at stages 1 and 2. Read
both before continuing.

There is no way back from a session file to a draft. If the draft is gone and
the session file is all that remains, say so plainly rather than editing the
session file by hand.

## Files

- `package_session.mjs` — turns a draft into a session file. Node 18 or later,
  no dependencies.
- `references/session-format.md` — the draft format, the session format, and
  the derivation rules. Read it before writing a draft.
- `references/draft.schema.json` — the same draft format as a JSON Schema.
  Generated from the packager, so it cannot disagree with what is enforced.
- `references/example-draft.json` — a worked example, also used as the
  regression fixture in the helper's test suite.
