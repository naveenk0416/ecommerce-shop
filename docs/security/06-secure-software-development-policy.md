# Secure Software Development Policy

| | |
|---|---|
| **Document Owner** | Chief Information Security Officer (CISO) |
| **Version** | 1.0 |
| **Effective Date** | 2026-08-11 |
| **Classification** | Internal — Confidential |
| **Applies To** | All SellAssist source code, dependencies, and release processes |

> **Implementation note:** mandatory second-reviewer code review, automated dependency scanning, and a staged CI/CD pipeline are not yet in place today — see Document 00. This policy also documents specific past secret-handling incidents in §5 precisely because they are real, not hypothetical, and this policy is the corrective control.

## Purpose

This policy defines how SellAssist builds software securely across the Angular frontend, Node.js backend, and MongoDB data layer — covering secure coding practice, review, dependency and secret management, and how code moves from development to production.

## Scope

Applies to all SellAssist source code (frontend and backend), infrastructure-as-configuration, and the release pipeline that deploys them, regardless of who authored the change — including AI-assisted development.

## Definitions

| Term | Definition |
|---|---|
| **SDLC** | Software Development Lifecycle. |
| **OWASP Top 10** | The Open Worldwide Application Security Project's list of the most critical web application security risks, used here as the baseline secure-coding checklist. |
| **Dependency Scanning** | Automated checking of third-party libraries for known vulnerabilities (CVEs). |
| **Secret** | Any credential, API key, token, or password required by the application at runtime. |
| **Release** | A deployment of new code to the production environment. |

## Policy

### 1. Secure Coding Standards

All code — frontend and backend — is written against the OWASP Top 10 as a baseline:

| OWASP Risk | SellAssist Standard |
|---|---|
| **Broken Access Control** | Every privileged backend route independently re-verifies the caller's identity and role server-side (Document 04 §2–3); the frontend hiding UI is never the enforcement point. |
| **Cryptographic Failures** | Passwords hashed with bcrypt; single-use tokens hashed with SHA-256; no sensitive data transmitted or stored in plaintext (Document 02, Document 05 §3). |
| **Injection** | All database queries use the ORM/ODM's parameterized query interface; no raw string concatenation into a database query. All user input is validated server-side regardless of client-side validation. |
| **Insecure Design** | Security-relevant decisions (e.g., account enumeration prevention, rate limiting) are made at design time, not bolted on after an incident. |
| **Security Misconfiguration** | CORS is an explicit origin allowlist, never a wildcard, in production (Document 08). Default framework error pages/stack traces are not exposed to end users. |
| **Vulnerable & Outdated Components** | See §3, Dependency Management. |
| **Identification & Authentication Failures** | See Document 02 (Password Policy) and Document 07 (token handling). |
| **Software & Data Integrity Failures** | Dependencies are installed from the official package registry with lockfile-pinned versions; the release process (§6) does not accept unreviewed changes to the dependency lockfile without explanation. |
| **Security Logging & Monitoring Failures** | See Document 08 — this is a tracked gap (Document 00); structured, attributable audit logging is planned but not yet implemented. |
| **Server-Side Request Forgery (SSRF)** | Any feature that fetches a URL supplied by user input (e.g., a barcode lookup or marketplace callback) validates and restricts the target before the backend makes the request. |

### 2. Code Review

- Every change is reviewed before it is considered ready for release. In the current team structure this includes AI-assisted review and self-review against this checklist; as the team grows, a mandatory second-human-reviewer gate before merge to the production branch is the required target (Document 00).
- Review specifically checks for: hardcoded secrets, missing server-side authorization checks on new routes, unvalidated user input reaching a database query or shell command, and any new third-party dependency's necessity and provenance.
- Security-relevant changes (authentication, authorization, payment handling, marketplace credential handling) receive explicit, deliberate review attention beyond a routine change, and are called out as such in the change description.

### 3. Dependency Management

- Dependencies are added deliberately, not speculatively — a new library is added because a feature requires it, not "for later."
- Automated dependency vulnerability scanning (e.g., GitHub Dependabot or equivalent) is the required standard; this is not yet configured on the repository today (Document 00) and is a near-term priority given it requires no architectural change to enable.
- Until automated scanning is enabled, dependency vulnerabilities are checked manually (`npm audit` or equivalent) before each release, and any high/critical finding is resolved or explicitly risk-accepted by the CISO before release.

### 4. API Security in Code

Covered in full in Document 07. At the coding-standard level: every new backend endpoint is written with authentication, authorization, input validation, and rate-limit applicability considered *before* the endpoint is considered done — not retrofitted after.

### 5. Secret Management

- Secrets (database connection strings, JWT signing key, marketplace API credentials, payment processor keys, email provider keys) are supplied via environment variables at deploy time, never hardcoded in source.
- Secrets are never committed to the source repository, including in example/template configuration files — a template file documents which variables are required, using placeholder values only, never a real credential.
- **This project has a documented history of secret-handling incidents that this policy exists to prevent recurrence of**, specifically: real credentials committed into a tracked `.env.example` template file on more than one occasion, and live credentials pasted directly into an AI assistant chat session on more than one occasion. Both classes of incident are now explicitly in scope of this policy:
  - Before any commit touching an example/template env file, the diff is checked for a value that is not an obvious placeholder.
  - Credentials are never pasted into any chat, ticket, or non-secret-store channel — they are set directly in the target environment (local `.env`, hosting platform's environment variable dashboard) by the person who holds them.
  - Any secret known to have been exposed via either path above is treated as compromised and rotated, not merely "probably fine" — see the rotation guidance this incident history has already triggered for this project.
- Secrets are scoped per-environment (development secrets are never valid production secrets, and vice versa).
- A secret rotation schedule and centralized secret-store (beyond hosting-platform environment variables) is a tracked gap (Document 00) as the team and infrastructure surface grows.

### 6. Security Testing

- New authentication, authorization, and payment-handling code paths are manually exercised against both the intended path and at least one deliberate misuse attempt (e.g., "what happens if I call this endpoint without a token," "what happens if I submit someone else's record ID") before release.
- Automated security testing (SAST/DAST tooling) is not yet integrated into the build; manual testing against this checklist is the current standard, with automated tooling as the target state.

### 7. Release Management

- Releases are deployed from the reviewed, version-controlled source — never from an uncommitted local change.
- A rollback path (redeploying the previous known-good version) is available for every release.
- A staged environment (deploy-and-verify before it reaches production traffic) and automated pre-deploy test gate is the required target model; the current process deploys directly to production and is a tracked gap (Document 00) — this is a priority as usage grows, since it directly affects the blast radius of a bad release.
- Every release that touches authentication, authorization, payment handling, or a marketplace integration is explicitly verified against the relevant path in production (or a close equivalent) immediately after deploy, not assumed to work because it passed local testing.

## Responsibilities

| Role | Responsibility |
|---|---|
| **CISO** | Owns this policy; approves risk acceptance of any unresolved dependency vulnerability at release time. |
| **Engineering** | Follows the coding standards in §1; performs the review and testing described in §2 and §6 on every change. |
| **Whoever holds a given credential** | Solely responsible for setting it directly in its target environment — never relaying it through chat, ticket, or documentation. |

## Review Schedule

Reviewed annually, and immediately after any incident involving a code vulnerability, dependency CVE, or secret exposure (feeding in from Document 03's Root Cause Analysis).

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-08-11 | CISO / ISMS Working Group | Initial publication, incorporating lessons from prior secret-handling incidents. |

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Owner / Founder | | | |
| CISO (acting) | | | |
