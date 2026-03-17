# Summa — Agent Development Guidelines

## Git Workflow

### Source of Truth
- **Always pull from `origin/master` before starting any work.**
- The GitHub remote is the source of truth — local state may be stale.

```bash
git fetch origin
git rebase origin/master
```

### Branches & Worktrees
- **Never commit directly to `master`.** All work happens on feature branches.
- Use **git worktrees** for parallel feature development so multiple agents can work simultaneously without conflicts.

```bash
# Create a worktree for a feature branch
git worktree add ../summa-feature-name -b feature/feature-name origin/master

# Work in that directory
cd ../summa-feature-name

# Clean up when done (after PR merge)
git worktree remove ../summa-feature-name
git branch -d feature/feature-name
```

### Pull Requests
- **All merges to `master` go through PRs.** No direct pushes.
- Branch naming: `feature/<short-name>` or `fix/<short-name>`
- PR title should match the Paperclip issue identifier and title (e.g. `SUM-4: Create user settings page`)
- Include `Co-Authored-By: Paperclip <noreply@paperclip.ing>` in commit messages

### Workflow Summary
1. Fetch + rebase on `origin/master`
2. Create a worktree with a feature branch
3. Implement the feature
4. Push branch and open PR via `gh pr create`
5. After PR merge, clean up worktree and branch

## Project Structure

- `src/app/` — Next.js App Router pages and layouts
- `src/app/api/` — REST API route handlers
- `src/app/(app)/` — Authenticated app routes (dashboard, portfolio, etc.)
- `src/app/(auth)/` — Auth routes (sign-in, sign-up)
- Stack: Next.js 15, TypeScript, Tailwind CSS, Drizzle ORM, PostgreSQL, Better Auth
