# Cloud Security Policy

| | |
|---|---|
| **Document Owner** | Chief Information Security Officer (CISO) |
| **Version** | 1.0 |
| **Effective Date** | 2026-08-11 |
| **Classification** | Internal — Confidential |
| **Applies To** | All cloud infrastructure hosting SellAssist's application, database, and supporting services |

> **Implementation note:** SellAssist runs entirely on managed cloud infrastructure (no self-managed servers) — this is itself a positive control (the provider carries physical/hypervisor-level security responsibility). Structured logging/monitoring and tested disaster recovery are gaps — see Document 00.

## Purpose

This policy defines the security standard for the cloud infrastructure SellAssist runs on: the application hosting platform, the managed database, and the supporting third-party services (email delivery, payment processing) that together form SellAssist's production environment.

## Scope

Covers SellAssist's backend hosting, frontend hosting, managed database, DNS/CDN edge layer, and the secrets/configuration that connect them. Does not cover the internal security practices of third-party providers themselves (their own ISO 27001/SOC 2 status is assessed as part of vendor selection, not governed by this document).

## Definitions

| Term | Definition |
|---|---|
| **Shared Responsibility Model** | The division of security responsibility between a cloud provider (physical infrastructure, hypervisor, in some cases network) and the customer (application configuration, access control, data). |
| **Edge/CDN Layer** | Infrastructure sitting in front of the application (e.g., Cloudflare) that terminates the first hop of TLS and can filter traffic before it reaches the application. |
| **Infrastructure as Configuration** | Defining server/deployment behavior through versioned configuration files rather than manual, undocumented setup. |
| **Managed Database** | A database service where the provider (not SellAssist) is responsible for the underlying server, patching, and storage-layer encryption. |

## Policy

### 1. Infrastructure Security

- SellAssist runs on managed cloud platforms for both application hosting and database — SellAssist does not operate self-managed, self-patched servers. This places OS-level patching, physical security, and hypervisor isolation within the hosting and database providers' shared-responsibility scope, and SellAssist's own responsibility is scoped to application configuration, access control, and data handling.
- The application binds to the network interface required for the hosting platform's routing layer to reach it; it is not exposed on an unnecessary interface or port.
- An edge/CDN layer sits in front of the application, providing the first layer of TLS termination and basic traffic filtering before requests reach the application server.
- Outbound network egress from the backend (to marketplace APIs, payment processor, email provider) is limited to the specific providers integration requires — the backend is not treated as a general-purpose outbound proxy.

### 2. Encryption

- **In transit:** enforced end-to-end — client to edge/CDN, edge to application, and application to database, all over TLS. See Document 05 §3 and Document 07 §1.
- **At rest:** the managed database provider's default storage-layer encryption protects data at rest. See Document 05 §3 for the additional application-layer hashing applied to Restricted-classification fields (passwords, tokens).
- Backups (§4) inherit the same at-rest encryption as primary storage.

### 3. Secrets

- Production secrets (database connection string, JWT signing key, marketplace and payment processor API credentials, email provider key) are configured directly in the hosting platform's environment variable store, not in source code or configuration files committed to the repository (Document 06 §5).
- Secrets differ between environments (local development, any staging environment, production) — a development secret is never a valid production credential.
- Rotating a secret (e.g., after Document 03 containment) is done directly in the hosting platform's environment configuration, followed by a redeploy/restart to pick up the new value, with the old value confirmed invalid before the incident is considered contained.
- A dedicated secrets-management service (beyond the hosting platform's built-in environment variable store) is a target-state uplift as the infrastructure surface grows (Document 00) — not required at current scale, but tracked for reassessment as the team and number of integrated services increases.

### 4. Backup

- The managed database provider's automated backup capability is the primary backup mechanism, running on the provider's standard schedule.
- Backups are retained for a period sufficient to recover from both a technical failure and a delayed-discovery data-integrity incident (e.g., a bug that silently corrupted data days before detection) — see Document 09 for specific retention and RPO targets.
- Backup access is subject to the same access-control standard as production data (Document 04) — a backup is not an easier path to the same Restricted/Confidential data.

### 5. Disaster Recovery

Covered in full in Document 09. At the infrastructure level: SellAssist's reliance on managed hosting and managed database services means disaster recovery for underlying hardware failure is substantially the provider's responsibility; SellAssist's own disaster recovery scope is the application configuration, secrets, and data restore process layered on top of that provider-level resilience.

### 6. Monitoring

- **Target standard:** automated monitoring of application error rates, response latency, and infrastructure health, with alerting to the CISO/on-call for anomalies consistent with the detection requirements in Document 03 §3.
- **Current state:** monitoring relies on the hosting platform's built-in dashboards and manual observation rather than configured automated alerting thresholds. This is tracked in Document 00 as a near-term priority, since it is the primary gap between SellAssist's current posture and the Detection stage of Document 03.

### 7. Logging

- Application-level logging is covered in Document 07 §7 (API logging) — the same gap (unstructured, unattributed, short-retention logging) applies at the infrastructure level: the hosting platform's default log retention is relied upon rather than a centralized, longer-retention log store.
- Infrastructure-level access logs (who logged into the hosting platform dashboard, who changed a configuration value) are provided by the hosting and database providers' own platform audit trails; SellAssist relies on these natively rather than maintaining a separate infrastructure audit log at this stage.

### 8. Vendor Risk

- Every cloud/infrastructure provider SellAssist depends on (application hosting, database, CDN/edge, email delivery, payment processing) is selected with its own security posture (published security documentation, compliance certifications where available) considered as part of selection.
- A provider's outage or security incident affecting SellAssist is handled through Document 03, with the provider's own status/incident communication channel monitored as part of Detection.

## Responsibilities

| Role | Responsibility |
|---|---|
| **CISO** | Owns this policy; approves selection of any new infrastructure or cloud service provider. |
| **Owner / Founder** | Holds primary administrative access to the hosting platform and database provider accounts (Document 04 §3, Admin role). |
| **Engineering** | Implements and maintains secure configuration of every service described in this policy. |

## Review Schedule

Reviewed annually, and immediately upon: adoption of a new infrastructure provider, a provider-side security incident affecting SellAssist, or a Document 03 incident with an infrastructure root cause.

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-08-11 | CISO / ISMS Working Group | Initial publication. |

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Owner / Founder | | | |
| CISO (acting) | | | |
