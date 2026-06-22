# Contributing

Thanks for helping improve AI Storyboard Studio.

## Development setup

1. Use Node.js 22 or newer and Python 3.11–3.13.
2. Run `npm install`.
3. Run `npm run dev` for development.
4. Use Mock mode unless a live provider request is necessary.

## Before opening a pull request

- Keep the change focused and explain the user-facing outcome.
- Do not commit credentials, cookies, databases, private media, logs, build output, or a bundled Hermes runtime.
- Run `npm run check`.
- Add or update a test when behavior changes.
- Update the README when setup, supported models, or user-visible limits change.

Provider APIs evolve. Prefer capability checks and clearly documented fallbacks over silently accepting unsupported parameters.

## Bug reports

Include the operating system, application version, reproduction steps, expected result, and actual result. Redact prompts, paths, account data, and media that should remain private.

For security issues, follow `SECURITY.md` instead of opening a public issue.
