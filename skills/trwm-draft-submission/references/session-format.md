# The TRWM session file format

This describes the JSON the TRWM SOLVE-IT Helper accepts through **Import from
File**, and the authoring draft the packager turns into it. It is written so
the skill can produce a valid session without reading the helper's source.

The version of the skill this belongs to, and the helper version it targets,
are stated in `SKILL.md` and reported by `package_session.mjs --version`. See
[When the helper changes](#when-the-helper-changes) at the end for what to do
when the application moves on.

---

## Two formats, one direction

```
draft.json  ──  package_session.mjs  ──▶  session.json  ──▶  Import from File
(what a          (derives everything      (what the helper
 person           the helper would         stores internally)
 decides)         compute itself)
```

Write the **draft**. Never hand-write the session file: several of its fields
are derived in an order-sensitive way, and getting the order wrong silently
attaches mitigations to the wrong weaknesses.

---

## The draft format

```jsonc
{
  "sessionName": "File type associations",      // optional; defaults to the technique name
  "authors": ["A. Person", "trwm-claude-skill"],// optional; the skill asks the user
                                                // whether they want their name on it, and
                                                // always adds itself so a reviewer can tell
                                                // the submission was drafted through it
  "resultsNotes": "",                           // optional free text
  "rationale": "",                              // optional; why the submission is shaped as it is.
                                                // The helper carries it into the exported bundle
                                                // under provenance, so it travels with the submission.

  "technique": {
    "id": "DFT-XXXX",                           // leave as DFT-XXXX for a new technique
    "name": "Extract file type associations",
    "description": "One or two sentences.",
    "synonyms": [],
    "details": "Longer prose, optional.",
    "examples": [],
    "inputClasses": ["https://ontology…/observable/FileSet"],
    "parentTechnique": "",                      // a DFT id, if this is a sub-technique
    "references": []
  },

  "results": [
    {
      "id": "DFTR1",                            // optional; defaults to DFTR1, DFTR2, …
      "name": "Association records",
      "description": "What this result is.",
      "ontologyOutputClasses": ["https://ontology…/configuration/Configuration"],
      "ontologyInputClasses": []
    }
  ],

  "weaknesses": [
    {
      "result": "DFTR1",                        // optional; defaults to the first result
      "errorClasses": ["ASTM_INCOMP"],          // one or more; the first fixes slot placement
      "effect": "the set of associations is incomplete",
      "causes": [
        {
          "text": "the set of associations is incomplete because per-user associations were not examined",
          "description": "Optional expansion.",
          "references": [],
          "mitigations": [
            { "text": "examine both machine-wide and per-user association stores",
              "existingId": "",                 // a DFM id if reusing an existing mitigation
              "description": "" }
          ]
        }
      ]
    }
  ],

  "mitigationDetails": [                        // optional; extras applied by matching text
    { "text": "examine both machine-wide and per-user association stores",
      "description": "Longer description used in the export bundle.",
      "technique": "DFT-1191",                  // a technique that implements the mitigation
      "references": [] }
  ]
}
```

### Rules the packager enforces

`draft.schema.json` in this directory is the same format as a JSON Schema
(Draft 2020-12). Point an editor at it while writing a draft and the errors
below appear as you type rather than when the packager runs. It is generated
from `DRAFT_SPEC` in `package_session.mjs`, so it cannot describe a different
format from the one enforced; a test regenerates it and fails if the checked-in
file is stale. Regenerate with `npm run schema`.

- **Every key must be one this format defines.** An unrecognised key is
  refused, with the nearest allowed key suggested where there is one:
  `weaknesses[0] has an unrecognised key "cause". Did you mean "causes"?` This
  is a hard error rather than a warning because an unrecognised key is simply
  not read, so the data it holds is dropped and the run otherwise reports
  success. Keys beginning with an underscore are treated as comments and
  ignored, which is how the shipped example carries its `_note`.
- `technique.name` and `technique.description` must be present.
- At least one result, each with an `id` matching `DFTR<n>`.
- Every weakness needs an `effect` and at least one recognised error class.
- Every cause needs `text`.
- A reference needs either a `DFCite_id` or a `citation_text`.
- A `DFCite_id` must look like `DFCite-1234`. A placeholder such as
  `DFCite-TODO` is refused: a new source carries `citation_text` and no id.

### References

A reference is `{ DFCite_id, citation_text, relevance_summary_280 }`, and may
be written as a bare string, which is taken as `citation_text`.

- **Already in the knowledge base** — give the `DFCite_id` and a relevance
  summary. Do not restate the citation text; the id is the reference.
- **A new source** — give `citation_text` and leave `DFCite_id` empty. It
  exports as a plain string for a maintainer to match against an existing
  citation or allocate an id for.

`relevance_summary_280` is limited to 280 characters, as the field name says.
The helper does not enforce this; the packager reports a `check:` line.

References attach in three places: `technique.references`, a cause's
`references` (each cause becomes its own weakness, so the citation belongs on
the cause rather than the effect), and `mitigationDetails[].references`.

How a citation may legitimately be arrived at is a matter for the skill, not
the format — see the stage 8 rules in `SKILL.md`. In short: from the knowledge
base, from BibTeX the user supplied, or resolved against a real record for a
source the user named. Never from recollection.

### Rules it warns about but allows

Reported on stderr as `check: …`, because a partial draft is still worth
importing:

- a weakness with no mitigation
- a result with no CASE output class
- no weakness slots at all
- a technique, weakness or mitigation name that starts with a lower-case
  letter, or ends with a full stop — SOLVE-IT uses sentence case and names
  carry no terminal stop
- a British spelling where the style guide requires US English, checked
  against a list of common pairs that is deliberately not exhaustive
- a relevance summary over 280 characters, or one written against a source
  with no `DFCite_id`, which the helper discards on export
- two or more causes under the same result and error class that reduce to the
  same weakness name, and will merge into one with the rest lost
- a cause that does not begin with its effect, so the effect was prepended and
  the resulting name reads as two sentences run together
- two mitigations differing only in punctuation or spacing, which stay
  separate because mitigation identity collapses whitespace and case and
  nothing else
- a `parentTechnique`, a linked technique, or an `existingId` that is not
  shaped like an identifier of its kind

### Rules that need the knowledge base

Run with `--kb <solve-it.json | url>`. Off by default, so an ordinary run
stays offline and reproducible. Reported as `check: …` alongside the rest:

- a `parentTechnique`, linked technique or reused `DFM-` id that is not in the
  knowledge base, which is the safety net for the rule that identifiers come
  from a lookup and never from memory
- a reused mitigation whose text does not match its recorded name, which
  proposes renaming that mitigation everywhere it is used
- a new mitigation whose name already exists, which should reuse the existing
  id instead of duplicating it
- a technique or weakness name that already exists in the knowledge base
- a `DFCite-` id that nothing in the knowledge base references. Citations are
  recorded in `solve-it.json` only where something cites them, so a real but
  unreferenced id looks unknown; this is reported as something to check, not
  as a statement that the id is wrong.

### Diagnosing and repairing a session

A session that does not conform still holds work that took a person hours, so
the packager explains and mends rather than refusing:

```bash
node package_session.mjs --check  <session.json>
node package_session.mjs --repair <session.json> --out <fixed.json>
```

`--check` reports the structural problems and every departure from the
published schema, each with its path. It reads the schema from
<https://trwm.hargs.co.uk/session.schema.json> unless `--session-schema` names
a file or another URL, and a schema it cannot load is an error rather than a
skipped check.

`--repair` mends only what is derived or structural — an index that must equal
its position, a hash that is a function of the mitigations, a missing container
with one correct empty form, a malformed date — and reports every change as a
`fixed:` line. Anything carrying meaning is left alone and reported as
`manual:`, including a key the helper does not accept, which is **kept in the
repaired file** rather than deleted. Which weakness an out-of-range mitigation
belongs to cannot be derived from the file, so it is never guessed.

The validator behind `--check` is written into `package_session.mjs`, because
the skill ships without dependencies. It is not trusted on its own: the
helper's suite runs it against ajv over a corpus of deliberately broken
sessions and fails if the two disagree.

`--strict` makes any check exit 1. Without it the packager writes the session
and exits 0 whatever it reports, because most checks are omissions for a
person to judge rather than errors.

The style rules come from `STYLE_GUIDE.md` in the SOLVE-IT repository, which
is authoritative. The packager only checks what can be checked mechanically —
sentence case, terminal stops, spelling pairs, field lengths. The rules that
need judgement, such as the investigator tests and whether a weakness name
describes a problem rather than an action, are in `SKILL.md`.

### Things it reports for confirmation

Reported on stderr as `note: …`. These are not problems:

- a mitigation reused under an existing `DFM-` id, with the weaknesses it is
  attached to. The export pairs the id with the text supplied here, so text
  that does not match the mitigation's real name proposes renaming it across
  the knowledge base. The packager cannot check the name offline, so it names
  the reuse and a person confirms it. Under `--kb` the name is compared for
  you, and the note says so instead of asking.
- the same `DFM-` id used with two different wordings in one draft.

### Writing effects and causes

A weakness is split in two, which is what the TRWM-AC variant is for:

- The **effect** is what goes wrong with the result. It carries no reason:
  *"the set of associations is incomplete"*.
- Each **cause** is a separate reason the effect happens, written as a
  complete sentence that begins with the effect text and continues with a
  connector: *"the set of associations is incomplete because per-user
  associations were not examined"*.

The split exists so that mitigations attach per cause. Two causes of the same
effect usually need different remedies, and a single merged weakness cannot
record that.

If a cause is written as a bare suffix (*"because X"*), the packager prepends
the effect, matching the helper's own handling of older data. Write the full
sentence anyway — it is what the helper's cause editor produces, and it is
what appears in the exported bundle.

A weakness with an empty `causes` array is carried through as a plain
weakness, and its mitigations attach to the effect itself.

### Error classes belong to the effect

`errorClasses` is a property of the weakness, meaning the effect. Every cause
derived from it inherits the same list, and a cause carries only `text`.

This is the intended model rather than a limitation to route around. An error
class describes *what goes wrong*; a cause is a *reason* it happens, and the
same kind of error can be arrived at several ways. A weakness caused by a tool
defect and one caused by an examiner's omission are still the same class of
error.

The consequence for drafting: **if two causes need different error classes,
they are causes of different effects.** Split them into two weaknesses with
distinct effect text, rather than duplicating one effect or settling for the
union of the classes. Recording the union makes the export claim, of every
cause, an error class that only some of them have.

### The ASTM error classes

Use these codes exactly. The order matters — see below.

| Code | Name | The question it asks |
|---|---|---|
| `ASTM_INCOMP` | Incompleteness | Has relevant information been missed? |
| `ASTM_INAC_EX` | Inaccuracy — Existence | Is something reported that is not there? |
| `ASTM_INAC_AS` | Inaccuracy — Association | Are things grouped together that do not belong together? |
| `ASTM_INAC_ALT` | Inaccuracy — Alteration | Is data changed in a way that changes its meaning? |
| `ASTM_INAC_COR` | Inaccuracy — Corruption | Is corrupt or missing data detected and compensated for? |
| `ASTM_MISINT` | Misinterpretation | Are results presented so as to encourage misreading? |

The first five come from ASTM E3016-18. Misinterpretation is from Hargreaves
et al. 2025.

---

## The session format

The application publishes this format as a JSON Schema at
<https://trwm.hargs.co.uk/session.schema.json>, generated from its own
`SESSION_SPEC` and carrying an `x-appVersion` recording the release it came
from. That is the authoritative contract; what follows is the working
description the packager was written against. Where the two disagree, the
schema is right and this file needs updating.

The keys below are the complete set the helper's `importFromFile()` accepts.
Anything else in the file is discarded on import, so there is no point
emitting it.

| Key | Type | Notes |
|---|---|---|
| `version` | string | The helper version the file targets |
| `created`, `modified` | string | `YYYY-MM-DD` |
| `sessionName` | string | Offered as the session name on import |
| `authors` | string[] | |
| `workflowVariant` | string | `TRWM-AC` for anything this skill produces |
| `technique` | object | See below |
| `results` | object[] | See below |
| `resultsNotes` | string | |
| `weaknessPrompts` | object | Result id → error class → slot[] |
| `aggregatedWeaknesses` | object[] | Derived; order is load-bearing |
| `mitigations` | object | **Integer index** → mitigation[] |
| `mitigationSummary` | array | Always `[]`; the helper rebuilds it on render |
| `mitigationRefinement` | object[] | Derived |
| `lastMitAggregationHash` | string | Derived; suppresses a spurious "re-aggregate" warning |
| `settings` | object | Not used by this skill |

`technique` holds `id`, `name`, `description`, `synonyms[]`, `details`,
`examples[]`, `inputClasses[]`, `parentTechnique`, `references[]`. Note
`inputClasses` and `parentTechnique` — the export bundle renames these to
`CASE_input_classes` and `parent_technique`, but the session file uses the
camel-case forms.

`results[]` holds `id`, `name`, `description`, `ontologyOutputClasses[]`,
`ontologyInputClasses[]`.

A **reference** is `{ DFCite_id, citation_text, relevance_summary_280 }`. On
export, one with a `DFCite_id` becomes an object and one without becomes a
plain string for later matching, so a new citation only needs
`citation_text`.

A **weakness prompt slot** is `{ text, additionalErrors, causes }`, where
`additionalErrors` has all six error class codes as keys with boolean values,
and `causes` is an array of `{ text }`.

### The derivations, and why they are in code

**Aggregation order.** The helper builds `aggregatedWeaknesses` by walking
results in key insertion order, then error classes in the order in the table
above, then slots in array order, then causes in array order. Entries
deduplicate on the lowercased, trimmed name, with the first occurrence fixing
the position.

**`mitigations` is keyed by position in that array**, as a string integer.
So if the drafted order and the derived order disagree, mitigations attach to
the wrong weaknesses — with no error, and nothing on screen to show it. This
is the single reason `package_session.mjs` exists rather than a prose
description of the format.

**Idempotency.** Because the packager reproduces the helper's own aggregation,
pressing **Re-aggregate from prompts** or **Aggregate mitigations** in the app
changes nothing. The helper's own test suite asserts exactly that, so a
change to either aggregation function in `index.html` fails it.

**`lastMitAggregationHash`** is a 32-bit hash of the concatenated normalised
mitigation names. Without it the app shows a "mitigations have changed since
aggregation" warning on a freshly imported session.

### Two behaviours to know about

**`repoId` marks a reused weakness.** An aggregated weakness may carry
`repoId` to reuse an existing `DFW-nnnn` rather than being allocated a
temporary id at export. Helper versions before 3.4.6 dropped this field on
re-aggregation, silently converting a reused weakness into a new proposal; if
a draft targets an older helper, check the export bundle before submitting.
The packager does not currently emit `repoId` — a draft that reuses existing
weaknesses has to set it in the session file by hand.

**Identical derived names merge.** Two causes that produce the same sentence
become one weakness, and their mitigations are combined. This is the helper's
behaviour, not the packager's, and it is usually what you want across results
and error classes. Within one result and one error class it is a duplicate,
and the packager reports it, because otherwise the cause quietly disappears.

---

## When the helper changes

The helper's repository keeps a suite that loads the packager's output into
the real application and asserts that the app's own aggregation and export
produce the same thing. It resolves this skill from a sibling checkout, so it
tests the published copy rather than one of its own. If it fails after a
change to `index.html`:

1. Work out which derivation moved — the failure message names the field.
2. Update `package_session.mjs` and the relevant section here.
3. Bump `TARGET_APP_VERSION` in `package_session.mjs` to the new
   `APP_VERSION`, and the targeted version at the top of this file.
4. Bump `SKILL_VERSION` too, in all three places — `package_session.mjs`,
   `SKILL.md`, and the top of this file. A test asserts they agree.
5. Build the release archive with `./package_skill.sh` from the repository
   root, and distribute that. Do not hand-zip the folder — see below.

The two versions are independent. `SKILL_VERSION` changes when the skill's
own instructions or packaging change; `TARGET_APP_VERSION` records the helper
release the format was last verified against. A copy reports both through
`package_session.mjs --version`.

## Packaging a release

`./package_skill.sh` builds `dist/trwm-draft-submission-<version>.zip`, taking
the version from the skill itself so an archive cannot be mislabelled.

**The archive must contain the skill folder as its root**, not the skill's
files loose at the top level:

```
trwm-draft-submission.zip
└── trwm-draft-submission/
    ├── SKILL.md
    ├── package_session.mjs
    └── references/
        ├── session-format.md
        └── example-draft.json
```

and not:

```
trwm-draft-submission.zip
├── SKILL.md
├── package_session.mjs
└── references/
```

Packaged the second way the skill installs into a directory whose name does not
match it, and fails to load with nothing in the failure to point at the cause.
Zipping from inside the folder produces the broken form, which is why this is a
script that checks its own output rather than an instruction to remember. The
script also refuses to build when the folder name disagrees with the `name:` in
`SKILL.md`, since the folder name is what becomes the archive root. The archive
*filename* is cosmetic and can be renamed.

`test/release.test.mjs` in this repository covers all of that, including the
flat-archive case.

The parts most likely to move are the allowed-keys list
(`index.html`, `importFromFile`), the error class list and its order
(`ERROR_CLASSES`), and the two aggregation functions
(`aggregateWeaknesses`, `aggregateMitigations`).
