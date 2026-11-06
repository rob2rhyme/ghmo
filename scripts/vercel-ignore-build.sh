#!/usr/bin/env bash
# Vercel "Ignored Build Step": exit 0 = skip this build, exit 1 = build.
# Keeps the free plan's daily deployment limit for changes that can affect the site.
branch="${VERCEL_GIT_COMMIT_REF:-}"
# The last commit Vercel deployed successfully on this branch (empty on a branch's first deployment).
previous="${VERCEL_GIT_PREVIOUS_SHA:-}"

# Dependabot branches: CI already tests them; a preview deploy per bump is wasted.
if [[ "$branch" == dependabot/* ]]; then
  echo "Skipping build: Dependabot branch ($branch)"
  exit 0
fi

# True when nothing but docs, tests, CI config or markdown changed between $1 and HEAD.
only_docs_since() {
  git diff --quiet "$1" HEAD -- . \
    ':(exclude)docs' ':(exclude)tests' ':(exclude).github' ':(exclude)*.md' ':(exclude).gitleaks.toml'
}

# Compare with the last successful deployment, so a push of several commits is judged as a whole and a
# deployment that failed (for example on the daily limit) is never skipped for good.
if [[ -n "$previous" ]] && git cat-file -e "${previous}^{commit}" 2>/dev/null; then
  if only_docs_since "$previous"; then
    echo "Skipping build: only docs, tests or CI config changed since ${previous:0:7}"
    exit 0
  fi
  exit 1
fi

# Production without a known last deployment: always build.
if [[ "$branch" == "main" ]]; then
  exit 1
fi

# Preview fallback: the previous commit only.
if git rev-parse --verify -q HEAD^ >/dev/null 2>&1 && only_docs_since HEAD^; then
  echo "Skipping build: only docs, tests or CI config changed"
  exit 0
fi

exit 1
