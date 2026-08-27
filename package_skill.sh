#!/usr/bin/env bash
#
# package_skill.sh — build a distributable ZIP of a skill in skills/.
#
#   ./package_skill.sh                        # defaults to trwm-draft-submission
#   ./package_skill.sh <skill-name>
#
# The archive must contain the skill folder as its root, not the skill's files
# loose at the top level. A skill packaged the wrong way round installs into a
# directory whose name does not match the skill, and fails to load with nothing
# obvious to point at. That is the whole reason this is a script rather than a
# line of documentation, and why it verifies the result before reporting
# success.
#
# Output: dist/<skill-name>-<version>.zip
#
set -euo pipefail

SKILL_NAME="${1:-trwm-draft-submission}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$REPO_DIR/skills"
SKILL_DIR="$SKILLS_DIR/$SKILL_NAME"
DIST_DIR="$REPO_DIR/dist"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

[ -d "$SKILL_DIR" ] || die "no skill at $SKILL_DIR"
[ -f "$SKILL_DIR/SKILL.md" ] || die "$SKILL_NAME has no SKILL.md"
command -v zip   >/dev/null 2>&1 || die "zip is not installed"
command -v unzip >/dev/null 2>&1 || die "unzip is not installed"

# The folder name is what the archive root becomes, and it has to match the
# name declared in the skill's front matter or the skill will not resolve.
DECLARED_NAME="$(sed -n 's/^name:[[:space:]]*//p' "$SKILL_DIR/SKILL.md" | head -1 | tr -d '\r')"
[ -n "$DECLARED_NAME" ] || die "SKILL.md has no name: in its front matter"
[ "$DECLARED_NAME" = "$SKILL_NAME" ] || \
  die "folder is '$SKILL_NAME' but SKILL.md declares name: $DECLARED_NAME — these must match"

# Version comes from the skill itself, so an archive cannot be mislabelled.
if [ -f "$SKILL_DIR/package_session.mjs" ]; then
  VERSION="$(node "$SKILL_DIR/package_session.mjs" --version | sed -n 's/^[^ ]* \([0-9.]*\).*/\1/p')"
else
  VERSION="$(sed -n 's/.*Skill version \([0-9][0-9.]*\)\..*/\1/p' "$SKILL_DIR/SKILL.md" | head -1)"
fi
[ -n "$VERSION" ] || die "could not determine the skill version"

mkdir -p "$DIST_DIR"
ZIP_PATH="$DIST_DIR/$SKILL_NAME-$VERSION.zip"
rm -f "$ZIP_PATH"

# Zipping from the skills/ directory and naming the folder is what puts the
# folder at the archive root. Zipping from inside the skill would not.
( cd "$SKILLS_DIR" && zip -q -r -X "$ZIP_PATH" "$SKILL_NAME" \
    -x '*.DS_Store' -x '__MACOSX/*' -x '*/.*.swp' -x '*~' )

# Verify rather than assume: every entry must sit under the skill folder.
BAD="$(unzip -Z1 "$ZIP_PATH" | grep -v "^$SKILL_NAME/" || true)"
if [ -n "$BAD" ]; then
  rm -f "$ZIP_PATH"
  die "archive root is wrong — these entries are not under $SKILL_NAME/:
$BAD"
fi
unzip -Z1 "$ZIP_PATH" | grep -q "^$SKILL_NAME/SKILL.md$" || {
  rm -f "$ZIP_PATH"
  die "archive does not contain $SKILL_NAME/SKILL.md"
}

printf '%s\n\n' "built $ZIP_PATH"
unzip -Z1 "$ZIP_PATH" | sed 's/^/  /'
printf '\n%s\n' "The folder at the archive root is what must match the skill name."
printf '%s\n' "The archive filename itself is cosmetic — rename it if you prefer."
