# Compliance Statement

| | |
|---|---|
| **Document Owner** | Chief Information Security Officer (CISO) |
| **Version** | 1.0 |
| **Effective Date** | 2026-08-11 |
| **Classification** | Public — suitable for sharing with marketplace partners and enterprise customers |
| **Applies To** | SellAssist's Information Security Management System as a whole |

> **Important — read before sharing externally:** this statement describes the **principles and framework** SellAssist's ISMS is designed against. It is **not** a claim of formal certification. SellAssist has not undergone a third-party ISO/IEC 27001 certification audit or a SOC 2 Type I/II attestation by an independent auditor as of the effective date above. Any reader relying on this statement for a vendor security assessment should request Document 00 (Statement of Applicability & Implementation Status) alongside it, which discloses current implementation status control-by-control.

## Purpose

This statement gives marketplace partners, enterprise customers, and auditors a single, honest summary of the standards SellAssist's security program is built against, and what "aligned with" means in each case — as distinct from formal certification, which SellAssist does not currently hold.

## Scope

Applies to SellAssist's entire ISMS as documented in this suite (Documents 00–09) and governs how SellAssist represents its own security posture in any external-facing context — sales conversation, marketplace partner application, enterprise customer security questionnaire, or public documentation.

## Definitions

| Term | Definition |
|---|---|
| **Aligned with** | SellAssist's policies and controls are designed following the named framework's principles; this is not equivalent to third-party-verified certification against that framework. |
| **Certified** | An independent, accredited body has formally audited and attested SellAssist meets a named standard. SellAssist does not currently hold any such certification. |
| **Framework** | A named external standard (e.g., ISO 27001, SOC 2) used as a design and evaluation reference, whether or not formal certification against it has been pursued. |

## Statement

SellAssist's Information Security Management System is designed in alignment with the following frameworks and principles:

- **ISO/IEC 27001 principles** — SellAssist's ISMS documentation suite (Documents 00–09) follows an ISO 27001-style structure: a governing information security policy, subordinate topic-specific policies, defined roles and responsibilities, a risk/gap register (Document 00), and a fixed review cycle. SellAssist has not pursued formal ISO 27001 certification as of this statement's effective date.
- **SOC 2 Security principles** — controls described across this suite map to the SOC 2 Security (common criteria) Trust Service Category: logical access control (Document 04), system operations and change management (Document 06), and risk mitigation (Document 03, Document 09). SellAssist has not undergone a SOC 2 Type I or Type II audit by an independent CPA firm as of this statement's effective date.
- **OWASP Top 10** — used as the baseline secure-coding checklist for all application development (Document 06 §1).
- **OAuth 2.0** — the required authorization standard for every outbound marketplace integration (Document 07 §3), so that SellAssist never handles a seller's marketplace password directly.
- **HTTPS/TLS** — enforced across every network hop in SellAssist's architecture: client to edge, edge to application, application to database, and application to every third-party API (Document 07 §1, Document 08 §2).
- **Role-Based Access Control (RBAC)** — governs both in-product access (customer roles) and internal personnel access to infrastructure (Document 04).
- **Least Privilege** — applied consistently: to in-product roles, to internal personnel access, and to the OAuth scopes requested from connected marketplaces (Document 01 §4, Document 04 §1, Document 07 §3).
- **Secure Development Lifecycle** — code review, dependency management, secret handling, and release management standards defined in Document 06, applied to every change regardless of whether it was authored by a human engineer or with AI assistance.
- **Marketplace Security Requirements** — SellAssist's Incident Response Plan (Document 03 §10) and API Security Policy (Document 07) are deliberately written as marketplace-agnostic standards, so that the same internal controls satisfy the security expectations of any connected marketplace — Amazon, Flipkart, Meesho, Instagram, Shopify, WooCommerce, or a future integration — rather than being built around any single marketplace's requirements.

### What This Statement Does Not Claim

For clarity, and consistent with Document 00:

- SellAssist does not claim ISO 27001 certification or SOC 2 attestation. Both would require an external accredited audit, which has not been performed.
- SellAssist does not claim full implementation of every control described in this suite as of the effective date — Document 00 discloses specific gaps (notably: multi-factor authentication is not yet implemented; audit logging is not yet structured/attributable; access reviews have not yet been formally run; no marketplace API integration is yet live).
- Where a marketplace partner's own security questionnaire asks a specific yes/no question this statement does not directly answer, the answer should be sourced from Document 00's control table, not inferred from this statement's framework-alignment language.

## Responsibilities

| Role | Responsibility |
|---|---|
| **CISO** | Owns this statement; approves any external use of it (sales material, partner application, customer questionnaire response). |
| **Anyone representing SellAssist externally** | Uses this statement's exact "aligned with" language, not stronger claims ("certified," "compliant," "audited") that Document 00 does not support. |

## Review Schedule

Reviewed annually, and immediately before submission to any marketplace partner's formal security review process, to ensure it still accurately reflects Document 00's current status.

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-08-11 | CISO / ISMS Working Group | Initial publication. |

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Owner / Founder | | | |
| CISO (acting) | | | |
