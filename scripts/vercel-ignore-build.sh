#!/usr/bin/env bash
# Vercel "Ignored Build Step": exit 0 = skip this build, exit 1 = build.
# Keeps the free plan's daily deployment limit for changes that can affect the site.
branch="${VERCEL_GIT_COMMIT_REF:-}"

# Dependabot branches: CI already tests them; a preview deploy per bump is wasted.
if [[ "$branch" == dependabot/* ]]; then
  echo "Skipping build: Dependabot branch ($branch)"
  exit 0
fi

# Never skip the production branch.
if [[ "$branch" == "main" ]]; then
  exit 1
fi

# Skip when only docs, tests, CI config or markdown changed since the previous commit.
if git rev-parse --verify -q HEAD^ >/dev/null 2>&1; then
  if git diff --quiet HEAD^ HEAD -- . \
    ':(exclude)docs' ':(exclude)tests' ':(exclude).github' ':(exclude)*.md' ':(exclude).gitleaks.toml'; then
    echo "Skipping build: only docs, tests or CI config changed"
    exit 0
  fi
fi

exit 1
