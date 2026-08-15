# SellAssist — Information Security Management System (ISMS)

This directory contains SellAssist's complete information security policy suite: an Information Security Management System designed in alignment with ISO/IEC 27001 principles, SOC 2 Security criteria, the OWASP Top 10, OAuth 2.0, Zero Trust, Least Privilege, and Role-Based Access Control — covering the platform's Angular frontend, Node.js backend, and MongoDB data layer, and written to be generic across every marketplace SellAssist connects to (Amazon, Flipkart, Meesho, Instagram, Shopify, WooCommerce, and future integrations), not specific to any one of them.

## Read This First

**[00 — Statement of Applicability & Implementation Status](00-implementation-status.md)** is not optional reading. Every other document in this suite describes SellAssist's *required* security standard — the policy. Document 00 is the honest, control-by-control record of what is actually implemented today versus what is planned. Before sharing any document in this suite with a marketplace partner, enterprise customer, or auditor, share Document 00 alongside it.

## Document Index

| # | Document | Covers |
|---|---|---|
| 00 | [Statement of Applicability & Implementation Status](00-implementation-status.md) | Gap assessment — current state vs. policy, for every control below. |
| 01 | [Information Security Policy](01-information-security-policy.md) | Governing ISMS policy; principles, objectives, and the structure of this suite. |
| 02 | [Password Policy](02-password-policy.md) | Password strength, storage, MFA, rotation, lockout, reset, admin standard. |
| 03 | [Incident Response Plan](03-incident-response-plan.md) | Roles, severity levels, detection through recovery, RCA, customer & marketplace communication. |
| 04 | [Access Control Policy](04-access-control-policy.md) | RBAC, least privilege, personnel roles, temporary access, quarterly review. |
| 05 | [Data Protection Policy](05-data-protection-policy.md) | Data classification, encryption, storage, backup, retention, deletion, privacy. |
| 06 | [Secure Software Development Policy](06-secure-software-development-policy.md) | Secure coding (OWASP-mapped), review, dependency scanning, secret management, testing, release. |
| 07 | [API Security Policy](07-api-security-policy.md) | OAuth 2.0, JWT, token rotation, rate limiting, logging, versioning, input/output handling — for SellAssist's own API and every marketplace integration. |
| 08 | [Cloud Security Policy](08-cloud-security-policy.md) | Infrastructure, encryption, secrets, backup, monitoring, logging at the hosting/platform level. |
| 09 | [Business Continuity & Disaster Recovery Plan](09-business-continuity-disaster-recovery-plan.md) | RTO/RPO targets, backup strategy, failover, testing schedule. |
| 10 | [Compliance Statement](10-compliance-statement.md) | Public-facing summary — safe to share externally; states alignment, not false certification claims. |

## How This Suite Is Meant to Be Used

- **For a marketplace partner security review** (e.g., an Amazon SP-API, Flipkart, or Meesho application security questionnaire): start with Document 10 (Compliance Statement) for the summary, Document 07 (API Security Policy) for integration-specific standards, and Document 00 for the honest yes/no on any specific control the reviewer asks about.
- **For an enterprise customer security questionnaire**: Document 05 (Data Protection) and Document 04 (Access Control) answer most standard questions; Document 00 answers "do you actually do this today."
- **Internally**: every document's Review Schedule section states how often it must be revisited — treat these dates as commitments, not suggestions. Document 00 should be updated the moment any control's status changes, not batched into the next scheduled review.

## Format

Each document follows a consistent structure — Title, Version/Owner/metadata table, Purpose, Scope, Definitions, Policy, Responsibilities, Review Schedule, Revision History, Approval — and is written in plain Markdown, suitable for direct conversion to PDF (e.g., via `pandoc doc.md -o doc.pdf`) for formal distribution.
