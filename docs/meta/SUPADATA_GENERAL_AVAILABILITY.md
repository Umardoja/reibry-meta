# Supadata general-availability gate

The current Supadata path is a private-development pilot. It stays default-off and limited to the configured development owner and approved canonical post identities. It is not ready for general availability.

Before enabling it for other REIBRY users, confirm all of the following:

- Written provider confirmation of the permitted source, storage, indexing, display, deletion, attribution, and thumbnail-caching uses for TikTok and Instagram metadata. Public accessibility alone is not sufficient.
- A reviewed privacy notice and in-product consent explaining that an opted-in public post URL is sent to the provider. Never send notes, plans, conversations, account identifiers, cookies, or private media.
- A paid-usage policy: per-user and global quotas, hard monetary ceilings, alerting before credits are exhausted, and no automatic upgrades or retries that can create unexpected charges.
- Authenticated, owner-scoped requests only, with strict canonical URL/identity validation, server-only credentials, request-size bounds, rate limits, idempotent attempt tracking, and source-match validation before a trusted write.
- A user-controlled retry path with bounded attempts. Saving a Memory must remain independent of enrichment, and provider failures must leave a clean saved link rather than a technical error.
- A retention and deletion policy for retrieved metadata, including how REIBRY handles deleted, private, changed, or revoked posts and expired thumbnail URLs.
- Sanitized operational observability: request counts, latency, outcomes, credit consumption, rejected identity categories, and alerting—without captions, URLs, user notes, credentials, or raw provider responses in logs.
- Two-user security tests, production-like load/rate-limit tests, accessibility review, and browser/device verification across the supported mobile share flows.

Until these gates are approved, keep `SUPADATA_DEV_ENABLED=false` by default and do not broaden the allowlist or provider access.
