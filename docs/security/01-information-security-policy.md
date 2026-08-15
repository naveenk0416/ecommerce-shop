# Information Security Policy

| | |
|---|---|
| **Document Owner** | Chief Information Security Officer (CISO) |
| **Version** | 1.0 |
| **Effective Date** | 2026-08-11 |
| **Classification** | Internal — Confidential |
| **Applies To** | All SellAssist personnel, systems, contractors, and connected third parties |

> **Implementation note:** this policy states SellAssist's required security standard. Current implementation status against each control is tracked in **Document 00 — Statement of Applicability & Implementation Status**, which should be read alongside this policy before it is relied upon for an external attestation.

## Purpose

This policy establishes SellAssist's Information Security Management System (ISMS): the governing framework of principles, controls, and responsibilities that protect the confidentiality, integrity, and availability of SellAssist's systems and the data entrusted to it — including seller account data, marketplace-connected data (Amazon, Flipkart, Meesho, Shopify, WooCommerce, and future integrations), product and listing data, and payment metadata.

This policy exists to give SellAssist personnel, marketplace partners, enterprise customers, and auditors a single, authoritative statement of what SellAssist commits to protecting, and how.

## Scope

This policy applies to:

- All production and non-production environments operated by SellAssist (application servers, databases, background jobs, hosting infrastructure).
- All source code, infrastructure configuration, and secrets belonging to SellAssist.
- All personnel — employees, contractors, and any individual granted access to SellAssist systems — regardless of employment type.
- All third-party services SellAssist integrates with, including but not limited to: marketplace platforms (Amazon, Flipkart, Meesho, Instagram, Shopify, WooCommerce, and any future marketplace integration), payment processors (Razorpay and any future processor), email delivery providers, cloud hosting providers, and AI/ML service providers used in product generation.
- All data processed on behalf of sellers using the SellAssist platform, and all data received from connected marketplaces.

This policy does not apply to systems or data outside SellAssist's control — for example, a marketplace's own internal systems once data has been transmitted to them under that marketplace's own security policies.

## Definitions

| Term | Definition |
|---|---|
| **ISMS** | Information Security Management System — the complete set of policies, processes, and controls described in this document suite. |
| **Confidentiality** | Ensuring information is accessible only to those authorized to access it. |
| **Integrity** | Ensuring information is accurate and has not been improperly altered. |
| **Availability** | Ensuring authorized users can access information and systems when needed. |
| **Personnel** | Any individual — employee, contractor, or founder — with access to SellAssist systems. |
| **Marketplace** | A connected e-commerce platform (Amazon, Flipkart, Meesho, Instagram, Shopify, WooCommerce, or a future integration) that SellAssist publishes listings to or reads data from on a seller's behalf. |
| **Least Privilege** | The principle that any user, process, or system component should hold only the minimum access necessary to perform its function. |
| **Zero Trust** | The principle that no request is trusted by default based on network location alone — every request is authenticated and authorized on its own merits. |
| **Security Incident** | Any confirmed or reasonably suspected event that compromises the confidentiality, integrity, or availability of SellAssist systems or data. See Document 03 for severity classification. |

## Policy

### 1. Governing Principles

SellAssist's ISMS is built on the following principles, consistent with ISO/IEC 27001, SOC 2 (Security, Availability, and Confidentiality Trust Service Criteria), and the OWASP Top 10:

1. **Least Privilege** — access is granted only to what a role requires, and no more.
2. **Defense in Depth** — no single control is relied upon exclusively; controls are layered (network, application, data).
3. **Zero Trust** — authentication and authorization are enforced on every request, not assumed from network position.
4. **Secure by Default** — new features ship with security controls enabled by default, not opt-in.
5. **Transparency with Accountability** — security posture is documented honestly (see Document 00), and gaps are tracked as a roadmap, not concealed.
6. **Continuous Improvement** — the ISMS is reviewed and updated on a fixed schedule and after every significant incident or system change, not only when convenient.

### 2. Information Security Objectives

SellAssist commits to:

- Protecting seller account credentials and personal data from unauthorized access, in accordance with Document 05 (Data Protection Policy).
- Protecting marketplace-connected data (product listings, order data, marketplace credentials/tokens) to a standard that satisfies the security expectations of connected marketplace partners, in accordance with Document 07 (API Security Policy).
- Maintaining the availability of the platform consistent with the targets defined in Document 09 (Business Continuity & Disaster Recovery Plan).
- Detecting, responding to, and learning from security incidents in accordance with Document 03 (Incident Response Plan).
- Building and releasing software in accordance with Document 06 (Secure Software Development Policy).

### 3. The ISMS Documentation Suite

This policy is the umbrella document for the following subordinate policies, all of which carry equal enforcement weight:

| Doc # | Title |
|---|---|
| 00 | Statement of Applicability & Implementation Status |
| 01 | Information Security Policy *(this document)* |
| 02 | Password Policy |
| 03 | Incident Response Plan |
| 04 | Access Control Policy |
| 05 | Data Protection Policy |
| 06 | Secure Software Development Policy |
| 07 | API Security Policy |
| 08 | Cloud Security Policy |
| 09 | Business Continuity & Disaster Recovery Plan |
| 10 | Compliance Statement |

Where a subordinate document conflicts with this policy, this policy governs unless the subordinate document is more restrictive, in which case the more restrictive control applies.

### 4. Marketplace & Third-Party Trust

SellAssist operates as an intermediary between sellers and multiple marketplace platforms. Accordingly:

- SellAssist will not request broader API scopes or permissions from any marketplace than are required for the specific feature being built (least privilege applied to third-party integrations, not only internal access).
- Marketplace-issued credentials (API keys, OAuth tokens) are treated as Restricted data under Document 05's classification scheme and are never logged, exposed in error messages, or transmitted to any system other than the marketplace that issued them and SellAssist's own backend.
- SellAssist will cooperate with a connected marketplace's own security review process (for example, Amazon SP-API's security assessment) and will not represent a control as active in such a review unless Document 00 confirms it.

### 5. Enforcement

Violation of this policy by personnel — including circumventing a security control, mishandling credentials, or disclosing seller/marketplace data outside authorized channels — is grounds for access revocation and, for employees or contractors, disciplinary action up to and including termination of engagement.

### 6. Exceptions

Any exception to this policy must be documented, time-bound, approved by the CISO (or acting owner), and recorded in Document 00 as a tracked gap rather than silently permitted.

## Responsibilities

| Role | Responsibility |
|---|---|
| **CISO / Acting Security Owner** | Owns this policy suite, approves exceptions, chairs incident response (Document 03), and maintains Document 00. |
| **Engineering** | Implements controls described across this suite; flags infeasible or conflicting requirements to the CISO rather than silently skipping them. |
| **All Personnel** | Complies with this policy as a condition of system access; reports suspected incidents immediately per Document 03. |

## Review Schedule

This policy is reviewed at minimum **annually**, and additionally upon: a material change to SellAssist's architecture or hosting provider, a security incident classified Sev-1 or Sev-2 under Document 03, or the addition of a new marketplace integration.

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-08-11 | CISO / ISMS Working Group | Initial publication. |

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Owner / Founder | | | |
| CISO (acting) | | | |
