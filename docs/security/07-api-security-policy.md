# API Security Policy

| | |
|---|---|
| **Document Owner** | Chief Information Security Officer (CISO) |
| **Version** | 1.0 |
| **Effective Date** | 2026-08-11 |
| **Classification** | Internal — Confidential |
| **Applies To** | SellAssist's own API, and every outbound integration with a marketplace or third-party API |

> **Implementation note:** this policy covers two surfaces — SellAssist's own backend API (live today, partially compliant with this standard per Document 00) and outbound marketplace integrations (Amazon SP-API, Flipkart Seller API, Meesho Partner API, Shopify API, and future integrations), which are **not yet live** in the product. §7 is written as the required standard those integrations must meet when built, not a description of an existing connection.

## Purpose

This policy defines the security standard for every API SellAssist exposes and every API SellAssist consumes — its own frontend-facing API, and outbound integrations with marketplace and payment platforms — so that the standard is consistent regardless of which specific marketplace or provider is involved, and so that it satisfies the API security expectations of marketplace partners reviewing SellAssist for integration access.

## Scope

Applies to:

- SellAssist's own backend REST API, consumed by its Angular frontend and any future first-party client.
- Every outbound API integration with a connected marketplace (Amazon SP-API, Flipkart Seller APIs, Meesho Partner APIs, Shopify APIs, WooCommerce APIs, Instagram, and any future marketplace).
- Every outbound API integration with a payment processor (Razorpay and any future processor) or other third-party service (email delivery, AI/ML providers).

## Definitions

| Term | Definition |
|---|---|
| **OAuth 2.0** | An authorization framework allowing a third party (SellAssist) limited, scoped access to a resource on a user's behalf without handling that user's marketplace password directly. |
| **JWT** | JSON Web Token — a signed, self-contained token used to represent an authenticated session. |
| **Refresh Token** | A longer-lived credential used to obtain a new short-lived access token without re-authenticating with a password. |
| **API Gateway** | The single enforcement point (in SellAssist's case, backend middleware) through which all API requests pass for authentication, rate limiting, and logging before reaching business logic. |
| **Scope** | The specific, limited set of permissions an OAuth token grants — e.g., "read product listings" without "place orders." |
| **Input Validation** | Rejecting or sanitizing data received from a caller before it is used, rather than trusting it is well-formed. |
| **Output Encoding** | Encoding data before it is rendered/returned so it cannot be misinterpreted as executable code by the receiving context (e.g., a browser). |

## Policy

### 1. Transport Security

Every API request — inbound to SellAssist's backend, and outbound to any marketplace or third-party provider — is made over HTTPS/TLS. Plaintext HTTP is never used for an API call carrying authentication material or user/marketplace data.

### 2. Authentication — SellAssist's Own API

- SellAssist's backend issues a signed JWT upon successful login, containing the minimum claims necessary to identify the account (account identifier and email) — no sensitive data is embedded in the token payload, since a JWT's payload is not encrypted, only signed.
- Every request to a protected route presents this token via the `Authorization: Bearer` header; the backend verifies the signature and re-derives the caller's identity and role from its own database on every request rather than trusting claims in the token beyond identity.
- **Target standard:** a short-lived access token (minutes-to-hours) paired with a longer-lived, rotating refresh token, with server-side revocation capability. **Current state:** a single 7-day JWT with no refresh mechanism and no server-side revocation list — a meaningful gap tracked in Document 00, since it means a stolen token remains usable for its full remaining lifetime even after the legitimate user changes their password (password change should, and does, invalidate stored sessions where session state is tracked, but a bearer JWT already issued remains cryptographically valid until natural expiry under the current design).

### 3. Authentication — Outbound Marketplace & Third-Party APIs

For every marketplace integration (Amazon SP-API, Flipkart, Meesho, Shopify, WooCommerce, or a future platform):

- **OAuth 2.0 is the required authentication method** wherever the marketplace's API supports it. SellAssist never asks a seller to enter their marketplace account password directly into SellAssist — access is obtained via the marketplace's own OAuth consent flow, so the seller authorizes SellAssist without sharing their marketplace credentials.
- The **narrowest available OAuth scope** for the feature being built is requested — e.g., a scope allowing listing management is requested independently of a scope allowing order fulfillment, and the latter is not requested until/unless a feature actually requires it (least privilege applied to third-party integrations, per Document 01 §4).
- Marketplace-issued access tokens and refresh tokens are stored as Restricted-classification data (Document 05 §1) — encrypted/isolated from general application data, never logged, and never returned in any API response to the frontend.
- Where the marketplace's platform supports token expiry and refresh, SellAssist implements refresh proactively rather than waiting for a call to fail.
- A seller can revoke SellAssist's access to a connected marketplace at any time from within SellAssist; doing so immediately deletes the stored credential (Document 05 §7).

### 4. Token Rotation

- Marketplace OAuth tokens are rotated/refreshed according to that marketplace's own token lifetime, proactively, not reactively.
- Any token known or suspected to be compromised (Document 03) is rotated immediately, and the marketplace is notified per Document 03 §10 where the marketplace's own terms require it.
- SellAssist's own session token rotation (moving from the current single-JWT model to short-lived-access + refresh-token) is tracked as a required uplift in Document 00.

### 5. API Gateway Pattern

All inbound requests to SellAssist's backend pass through a single, consistent middleware chain before reaching business logic — no route bypasses this chain:

1. CORS origin check (Document 08).
2. Rate limiting (§6).
3. Authentication (token verification).
4. Authorization (role/ownership check specific to the route, Document 04).
5. Input validation (§9).

This ordering means an unauthenticated or rate-limited request never reaches application logic, and a request that fails authorization never reaches a database query for data it isn't entitled to.

### 6. Rate Limiting

- Authentication-related endpoints (login, registration, password reset, resend-verification) enforce rate limits keyed on both source IP and target account, so that a single abusive source cannot lock out unrelated accounts, and a single targeted account cannot be brute-forced from many sources.
- Rate limit responses use the standard `429` status with rate-limit headers, so legitimate clients (including a marketplace calling SellAssist, if that pattern is ever built) can back off correctly rather than retry blindly.
- Outbound calls to marketplace APIs respect that marketplace's own published rate limits — SellAssist does not treat a marketplace's rate limit as a target to approach, and implements backoff/retry logic consistent with each marketplace's documented guidance, since marketplace partners routinely review integration behavior for rate-limit compliance as a condition of continued API access.

### 7. API Logging & Monitoring

- **Target standard:** every API request (inbound and outbound) is logged with caller identity, endpoint, timestamp, and outcome, retained for a defined period, and monitored for anomalous patterns (spike in failures, unusual access pattern to another account's data).
- **Current state:** logging is unstructured (method and path only, to stdout), not attributable to a specific account, and not retained beyond the hosting platform's default window. This is the most significant gap in this policy area (Document 00) and directly affects SellAssist's ability to investigate an incident (Document 03 §4) or satisfy a marketplace partner's security review, which typically asks specifically about API access logging.

### 8. API Versioning

- Breaking changes to SellAssist's own API are introduced via a new version path or explicit deprecation notice, not as a silent breaking change to an existing route a client depends on.
- Integrations with marketplace APIs pin to a specific, documented API version per marketplace, and are deliberately re-tested when a marketplace deprecates or updates its API version, rather than assuming forward compatibility.

### 9. Input Validation

- All input is validated **server-side**, regardless of any client-side validation — client-side checks are a user-experience convenience only (see Document 06 §1, Injection).
- Validation includes: type/format checking (e.g., email format, numeric ranges), length limits, and rejection of unexpected fields.
- Data received *from* a marketplace API (order data, callback payloads) is validated with the same rigor as data received from SellAssist's own frontend — a marketplace is a trusted partner, not a trusted input source, and its payloads are treated as external input.

### 10. Output Encoding

- Data returned by the API that will be rendered in a browser (directly or via the Angular frontend) is encoded/escaped appropriately for its rendering context, preventing stored or reflected cross-site scripting.
- Error responses do not leak internal implementation detail (stack traces, database error strings, file paths) to the caller — a generic, safe error message is returned to the client while full detail is available server-side for troubleshooting.

## Responsibilities

| Role | Responsibility |
|---|---|
| **CISO** | Owns this policy; approves the OAuth scope requested for any new marketplace integration before it is built. |
| **Engineering** | Implements every control in this policy for both SellAssist's own API and any new outbound integration; treats API logging/monitoring uplift (§7) as a standing priority. |
| **Integration Owner (per marketplace)** | For each connected marketplace, maintains awareness of that marketplace's specific API version, rate limits, and token lifetime, and ensures SellAssist's integration stays current against them. |

## Review Schedule

Reviewed annually, and immediately before any new marketplace or third-party API integration is added to the product.

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-08-11 | CISO / ISMS Working Group | Initial publication. |

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Owner / Founder | | | |
| CISO (acting) | | | |
