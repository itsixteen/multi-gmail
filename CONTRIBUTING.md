# Contributing

Thank you for helping make multi-account Gmail workflows safer and easier to use.

## Before opening a change

- Search existing issues and discussions.
- For a bug, include a minimal reproduction without real email content or credentials.
- For a feature, describe the user problem and security boundary before proposing an API shape.
- Open an issue before a large architectural change.

## Development setup

```bash
git clone https://github.com/itsixteen/multi-gmail.git
cd multi-gmail/plugins/multi-gmail
npm ci
npm test
npm run build
```

Node.js 20 and 22 are tested in CI. Runtime bundles in `dist/` are committed so users do not need to install npm dependencies.

## Pull requests

1. Keep the change focused.
2. Add or update tests for behavior changes.
3. Run `npm test` and `npm run build`.
4. Update documentation and `CHANGELOG.md` when user-visible behavior changes.
5. Rebuild `dist/` and include it in the pull request.
6. Confirm that no credentials, mailbox data, personal paths, or account identifiers are present.

## Security-sensitive changes

Changes involving OAuth, token storage, account resolution, write tools, tool annotations, MIME parsing, or network transport need explicit tests for failure paths and authorization boundaries.

Do not weaken these invariants:

- `account="all"` is read-only.
- Writes require one resolvable account.
- Cross-account partial failure is reported.
- Permanent deletion is unavailable.
- Secrets are absent from tool results and logs.

## Style

- TypeScript is the source of truth.
- Prefer small, explicit functions over hidden global state.
- Return actionable errors without leaking secrets.
- Keep tool names and schemas backward compatible after a stable release.

By contributing, you agree that your contribution is licensed under the MIT License.
