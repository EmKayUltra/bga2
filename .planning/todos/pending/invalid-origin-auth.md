---
created: 2026-03-02
source: manual testing
priority: medium
---

# "Invalid origin" error on account registration

When trying to create an account via the UI, getting "Invalid origin" error. Likely a better-auth origin validation issue — the `trustedOrigins` config may not include the Docker client URL or the request origin header doesn't match what better-auth expects.

Investigate: apps/client/src/lib/auth.ts and apps/server auth proxy config.
