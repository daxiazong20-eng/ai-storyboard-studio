# Security Policy

## Reporting a vulnerability

Do not open a public issue containing credentials, OAuth material, private media, or exploit details.

Until a dedicated security contact is published, open a GitHub Security Advisory draft for the repository. Include the affected version, reproduction steps, impact, and any proposed mitigation. Remove secrets and personal data from screenshots and logs.

## Credential boundaries

- The Electron renderer must never receive provider tokens.
- OAuth and credential refresh are delegated to the local Hermes installation.
- Credentials, cookies, `.env` files, databases, logs, and generated private media must not be committed or included in release archives.
- The source repository does not ship a Hermes runtime. Maintainers who create bundled builds are responsible for reviewing the bundle and preserving third-party licenses.

No security support window is promised for this early release. Users should keep Electron, Hermes, and operating-system dependencies current.
