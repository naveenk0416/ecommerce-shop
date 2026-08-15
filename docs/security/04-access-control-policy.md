# Access Control Policy

| | |
|---|---|
| **Document Owner** | Chief Information Security Officer (CISO) |
| **Version** | 1.0 |
| **Effective Date** | 2026-08-11 |
| **Classification** | Internal — Confidential |
| **Applies To** | All access to SellAssist systems, infrastructure, and data — personnel and in-product |

> **Implementation note:** SellAssist's product today enforces three in-product roles server-side (`FREE`, `PAID_PRO`, `ADMIN`). The internal-personnel role separation (Support / Developer as distinct from Admin) described below is the target model — see Document 00. In the current small-team reality, personnel with production access typically hold Developer-equivalent access broadly; the role boundaries in §2 are the standard to grow into as the team scales.

## Purpose

This policy defines who may access SellAssist systems and data, under what role, at what level of privilege, and how that access is granted, reviewed, and revoked — applying Role-Based Access Control (RBAC) and the Principle of Least Privilege throughout.

## Scope

Covers two distinct access surfaces, both governed by this policy:

1. **In-product access** — what a SellAssist *customer* (seller) can see and do within the application, gated by their account role.
2. **Internal/infrastructure access** — what SellAssist *personnel* can see and do in production systems: the database, hosting platform, source repository, secrets store, and customer support tooling.

## Definitions

| Term | Definition |
|---|---|
| **RBAC** | Role-Based Access Control — access rights assigned to roles, not individuals, and individuals assigned to roles. |
| **Least Privilege** | A user or process is granted only the access required for its function, no more. |
| **Privileged Access** | Any access beyond that of a standard customer account — administrative, support, or infrastructure-level access. |
| **Temporary Access** | Access granted for a defined, limited time window tied to a specific need (e.g., an incident investigation). |
| **Access Review** | A periodic, documented audit confirming that every active grant of access is still justified. |
| **In-Product Role** | A role stored on the user record (`FREE`, `PAID_PRO`, `ADMIN`) that governs what a customer can do inside the SellAssist application. |
| **Personnel Role** | An internal role (Admin, Support, Developer) governing what a member of the SellAssist team can access in production infrastructure, independent of any customer-facing role. |

## Policy

### 1. Guiding Principles

- **Default deny.** No access is granted implicitly; every access grant is explicit and attributable to a named individual.
- **Least privilege.** Access is scoped to what a role's function requires — a Support role does not receive Developer-level infrastructure access merely because it is convenient.
- **Attribution.** Shared or generic credentials for privileged access are prohibited (see Document 02 §7); every privileged action must be traceable to an individual.
- **Time-bound where possible.** Access that is only needed temporarily is granted temporarily, not permanently "just in case."

### 2. In-Product Roles (Customer-Facing RBAC)

| Role | Description | Access |
|---|---|---|
| **FREE** | Default role on registration. | Core listing-generation features within free-tier usage limits; own data only. |
| **PAID_PRO** | Subscribed customer. | All FREE access plus higher usage limits and premium features (e.g., extended inventory tools); own data only. |
| **ADMIN** | Internal SellAssist personnel granted administrative access to the product's admin console. | Full read/write access to all customer accounts and listings via the admin panel, user role management, and platform-wide data views. |

Enforcement: every privileged route on the backend independently verifies the requesting user's role server-side before returning data or performing a mutation — the frontend hiding a button is a UX convenience, never the access control itself. Role changes may only be performed by an existing `ADMIN`, and an admin cannot demote or delete their own account, and the last remaining `ADMIN` account cannot be deleted or demoted, to prevent accidental lockout of the entire platform.

### 3. Internal Personnel Roles (Infrastructure & Support Access)

These roles govern access to systems *behind* the product — the database, hosting dashboard, source repository, and secret store — and are independent of the in-product roles above.

| Role | Typical Access | Least-Privilege Boundary |
|---|---|---|
| **Admin** | Full production access: database, hosting platform, secrets, deployment. | Reserved for founders/senior engineering. Every use of direct database or infrastructure access outside normal application flow is logged and reviewable. |
| **Developer** | Source repository, non-production/staging environments, ability to deploy through the standard release process (Document 06). | Does not require standing direct production-database access for day-to-day work — production data is reached through the application and its audit-logged admin tooling, not ad hoc database queries, except during an active incident investigation (Document 03) or an approved temporary-access grant (§5). |
| **Support** | The in-product Admin console only (§2), scoped to customer-support functions (viewing/editing a customer's listings, assisting with account issues). | Explicitly does **not** receive direct database, hosting-platform, or secrets access. All support actions go through the same audit-logged admin routes a customer's data would otherwise be reached through. |
| **Customer** | Their own account and data only, via the standard product surface. | No access to any other customer's data, by default-deny enforcement at the API layer (every data-returning route filters by the authenticated user's own identifier unless the caller holds `ADMIN`). |

### 4. Access Provisioning & De-provisioning

- Access is granted only after a request is approved by the CISO (or, for Admin-tier access, the Owner/Founder), and is recorded — who requested it, who approved it, what was granted, and when.
- Access is revoked **immediately** upon a person's departure from the team, or immediately upon role change if the new role requires less access than the old.
- Shared accounts for infrastructure access (hosting platform, database) are prohibited; each individual authenticates as themselves.

### 5. Temporary Access

- Temporary access (e.g., a Developer granted time-limited production database read access to investigate a specific bug, or elevated access during a Document 03 incident) is granted with an explicit expiry — not left open pending manual revocation.
- The grant records: who, what specifically, why, and the expiry time.
- Temporary access expires automatically where the underlying platform supports it; where it does not, revocation is a checklist item owned by whoever approved the grant, due at the stated expiry.
- Temporary access granted during an active security incident is reviewed as part of that incident's Root Cause Analysis (Document 03 §7) to confirm it was revoked.

### 6. Quarterly Access Review

Every quarter, the CISO (or acting owner) performs and documents a review covering:

- Every individual with standing Admin or Developer infrastructure access, confirming the access is still required for their current role.
- Every in-product `ADMIN` account, confirming it corresponds to a current, active member of the team.
- Every active third-party integration credential (marketplace API keys, payment processor keys, email provider keys) and its scope, confirming least-privilege still holds as the product has evolved.
- Any temporary access grant (§5) that appears not to have expired/been revoked on schedule.

Findings are recorded even when the review finds nothing to remediate — an executed-and-clean review is itself the evidence of an operating control. Any access found to be unjustified is revoked immediately as part of the review, not queued for "later."

### 7. Session Management

- Authenticated sessions are represented by a signed token (see Document 07 for token handling standards).
- A password reset or password change invalidates prior sessions for that account.
- Administrative sessions are subject to the stricter timeout and MFA requirements in Document 02 §7.

## Responsibilities

| Role | Responsibility |
|---|---|
| **CISO** | Owns this policy, approves access grants and the quarterly review, maintains the access log. |
| **Owner / Founder** | Approves Admin-tier infrastructure access grants. |
| **Engineering** | Implements server-side enforcement of every role boundary described in §2 and §3; never relies on client-side role checks alone. |
| **All Personnel** | Uses only the access granted to them; requests additional access through the defined process rather than working around a restriction. |

## Review Schedule

The access grants themselves are reviewed **quarterly** per §6. This policy document is reviewed **annually**, and immediately upon any change to the in-product role model or the internal team's structure.

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-08-11 | CISO / ISMS Working Group | Initial publication. |

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Owner / Founder | | | |
| CISO (acting) | | | |
