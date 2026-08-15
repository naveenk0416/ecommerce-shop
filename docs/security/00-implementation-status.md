# Statement of Applicability & Implementation Status

| | |
|---|---|
| **Document Owner** | Chief Information Security Officer (CISO) |
| **Version** | 1.0 |
| **Effective Date** | 2026-08-11 |
| **Classification** | Internal — Confidential |
| **Applies To** | SellAssist ISMS Documentation Suite (Documents 01–10) |

## Purpose

This document exists because the ten policies that follow (01–10) are written as **governing policy** — the standard SellAssist commits to operating against, in the format expected by ISO 27001, SOC 2, and marketplace partner security reviews. Policy documents of this kind are normally written *before* every control they describe is fully operational; that is the standard order of operations in building an ISMS (Information Security Management System): publish the policy, run a gap assessment against it, remediate, then seek external attestation.

This document is that gap assessment. It exists so that SellAssist — and anyone reviewing the suite on SellAssist's behalf — can see plainly which controls are **implemented today**, which are **partially implemented**, and which are **planned but not yet built**, at the time of writing. Do not represent the policies in Documents 01–10 as a description of SellAssist's current operating state without reading this document alongside them. Submitting the policy suite to a marketplace partner, enterprise customer, or auditor as evidence of *current* compliance, without this gap disclosure, risks a misrepresentation the organization has not actually verified.

This document should be updated every time a control moves from Planned → Partial → Implemented, and reviewed in full at each ISMS review cycle (see Document 01, §Review Schedule).

## Status Legend

| Status | Meaning |
|---|---|
| ✅ Implemented | Control is live in production today and can be demonstrated on request. |
| 🟡 Partial | Some part of the control exists; it does not yet meet the full policy requirement. |
| ⬜ Planned | Described in policy as required; not yet built. |

## Control Status Summary

| Control area | Policy requirement | Status | Notes |
|---|---|---|---|
| Password hashing | bcrypt | ✅ | bcrypt, cost factor 10. |
| Password complexity | Min. 12 characters, upper/lower/number/special | 🟡 | Currently enforced at **minimum 8 characters** with the same character-class requirements. Raising the minimum to 12 is a product decision with user-facing impact (existing passwords are not retroactively affected) and has not yet been made. |
| Password reset | Time-limited, single-use, hashed token | ✅ | Reset tokens are SHA-256 hashed at rest, expire in 30 minutes, and are invalidated on use. |
| Email verification | Time-limited, single-use, hashed token | ✅ | Verification tokens are SHA-256 hashed at rest and expire in 24 hours. |
| Multi-Factor Authentication (MFA) | Available/enforced for privileged accounts | ⬜ | Not implemented. No TOTP, SMS, or hardware-key second factor exists in the authentication flow today. This is the single largest gap against this policy suite. |
| JWT session tokens | Short-lived access token + refresh token rotation | 🟡 | A single JWT with a 7-day expiry is issued at login. There is no separate short-lived access token, no refresh token, and no server-side revocation list — a stolen token remains valid for up to 7 days regardless of password change or logout. |
| Rate limiting / brute-force protection | Applied to authentication endpoints | ✅ | Login, registration, password-reset, and resend-verification endpoints are rate-limited (IP + account keyed) via `express-rate-limit`. |
| Account lockout | Lockout after N failed attempts | ⬜ | Rate limiting throttles repeated attempts; there is no separate account-lockout state, no admin unlock workflow, and no user-facing lockout notification. |
| Role-Based Access Control | Distinct roles with least-privilege enforcement | 🟡 | Three in-product roles exist (`FREE`, `PAID_PRO`, `ADMIN`), enforced server-side on every privileged route. There is no distinct technical separation between internal personnel roles (Admin / Support / Developer) described in Document 04 — today, any engineer with production database or hosting-platform access effectively has full access, not a scoped subset. |
| Quarterly access review | Documented, scheduled review of who has access to what | ⬜ | No formal review has been run. This is a process gap, not a technical one — closing it does not require new code. |
| Audit logging | Structured, attributable, retained security event log | ⬜ | Current logging is unstructured request logging to stdout (method + path only), not attributable to a user identity in a queryable way, and not retained beyond the hosting platform's default log window. There is no tamper-evident audit trail for privileged actions (role changes, data deletion, admin logins). |
| Transport encryption | TLS/HTTPS in transit | ✅ | Enforced end-to-end (Cloudflare → Render, and Render → MongoDB Atlas). |
| Encryption at rest | Database and backups encrypted at rest | ✅ | Provided by MongoDB Atlas's default storage encryption. No additional application-level field encryption is applied to specific PII fields beyond password/token hashing. |
| Secrets management | Centralized secret storage, rotation policy | 🟡 | Secrets are held in environment variables (not committed to source in the current codebase state). However, this project has a documented history of real credential exposure incidents (committed `.env.example` values, secrets pasted into chat) — see Document 06, §Secret Management. No secret rotation schedule or vault-based secret storage exists. |
| CORS policy | Explicit allowlist, not wildcard | ✅ | Origin allowlist enforced via configured `FRONTEND_URL` values plus localhost for development. |
| Dependency scanning | Automated vulnerability scanning of dependencies | ⬜ | Not configured. No Dependabot, Snyk, or equivalent is active on the repository at time of writing. |
| Code review | Mandatory peer review before merge to production | 🟡 | Development is currently performed by a single engineer working with an AI pair-programming assistant; there is no second human reviewer gate before deployment. |
| CI/CD pipeline | Automated build, test, and staged deployment | ⬜ | Deployment is a direct push-to-deploy to the hosting platform. There is no staging environment, no automated test gate, and no deployment approval step. |
| Marketplace API integrations (Amazon, Flipkart, Meesho) | OAuth 2.0-based, least-privilege scoped | ⬜ | **Not yet live.** The "Publish Center" feature referenced throughout this suite is a placeholder in the current product — no marketplace has been connected via API, and no OAuth flow for a marketplace integration has been implemented. Document 07 (API Security Policy) describes the required standard for when this is built, not a live integration. |
| Backup strategy | Regular, tested, documented backups | 🟡 | MongoDB Atlas provides automated backups by default at the infrastructure level. No independent backup-restore test has been performed and documented by SellAssist; RTO/RPO figures in Document 09 are targets, not measured/proven values. |
| Disaster recovery testing | Scheduled DR test/tabletop exercise | ⬜ | No DR test has been conducted. |
| Incident response | Documented plan with defined roles | 🟡 | This document suite establishes the plan (Document 03). It has not yet been exercised — no drill or real incident has tested it end-to-end. |

## How to Use This Document

- **Before submitting any document in this suite to a marketplace partner, enterprise customer, or auditor**, attach or reference this status summary, or ensure the recipient's questionnaire is answered from this table rather than from the policy text alone.
- **Before making a written compliance claim** (e.g., "SellAssist enforces MFA," "SellAssist performs quarterly access reviews") in a sales, legal, or partner context, confirm the relevant row above is ✅, not 🟡 or ⬜.
- Treat ⬜ rows as the security roadmap. They are the gaps most likely to be asked about in a marketplace security review (Amazon SP-API's security questionnaire, in particular, asks directly about MFA, access review cadence, and incident response testing).

## Responsibilities

The CISO (or acting owner, in an organization of this size) is responsible for keeping this table current and for ensuring no external-facing use of Documents 01–10 occurs without this document being reviewed first.

## Review Schedule

Reviewed and updated at minimum quarterly, and immediately upon any change in status of a listed control.

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-08-11 | CISO / ISMS Working Group | Initial gap assessment accompanying the first published version of the ISMS documentation suite. |

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Owner / Founder | | | |
| CISO (acting) | | | |
