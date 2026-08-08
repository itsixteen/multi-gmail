## What changed

Describe the user-visible outcome.

## Safety impact

- Which Gmail scopes or account-selection rules are affected?
- Is this read-only, a reversible write, a send, or a destructive action?
- Could any credential or message content reach logs or tool output?

## Verification

- [ ] `npm test`
- [ ] `npm run build`
- [ ] `node scripts/release-check.mjs` from the repository root
- [ ] No credentials, tokens, OAuth URLs, email addresses, or private message content added
- [ ] Documentation updated when behavior changed
