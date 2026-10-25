# CLAUDE.md

## Pull request and push policy

Vercel Hobby allows 100 deployments/day, and every push to any branch triggers one.
Batch changes into as few pushes and PRs as possible.

- Commit locally as often as needed, but do NOT push after every commit.
- Never push or open a PR unless I explicitly ask.
- When I do ask, push once, with all accumulated commits together.
- Use one long-lived branch per feature or milestone (e.g. `feature-clock-in`),
  with one PR per branch. Do not create a new branch or PR per small fix.
- Before opening a PR, check for an existing one (`gh pr list --head <branch>`).
  If one exists, push to it instead of creating a new one.
- Follow-up fixes and review feedback go onto the same branch/PR as new commits,
  and are pushed together in a single push.
- Run lint, tests, and build locally before any push. Never use CI or Vercel
  deployments to find failures.
