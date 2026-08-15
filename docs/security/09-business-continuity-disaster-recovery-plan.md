# Business Continuity & Disaster Recovery Plan

| | |
|---|---|
| **Document Owner** | Chief Information Security Officer (CISO) |
| **Version** | 1.0 |
| **Effective Date** | 2026-08-11 |
| **Classification** | Internal — Confidential |
| **Applies To** | SellAssist's production application, database, and supporting infrastructure |

> **Implementation note:** the targets in this document have not yet been validated by an actual restore test or failover drill — see Document 00 and §6 below. Treat them as committed targets, not measured/proven capability, until the first test cycle is complete.

## Purpose

This plan defines how SellAssist maintains availability of its service and recovers from a disruptive event — infrastructure failure, data corruption, or a security incident requiring service interruption — including the specific recovery targets SellAssist commits to and the schedule on which this plan is tested.

## Scope

Covers the production application (frontend and backend), the primary database, and the third-party services (payment processing, email delivery, marketplace integrations) the platform depends on to function. Complements Document 03 (Incident Response Plan), which governs the security-specific response *decision-making*; this document governs the *technical recovery mechanics*.

## Definitions

| Term | Definition |
|---|---|
| **RTO (Recovery Time Objective)** | The maximum acceptable time between an outage starting and service being restored. |
| **RPO (Recovery Point Objective)** | The maximum acceptable amount of data loss, measured in time — "we can lose at most the last N hours of data." |
| **Failover** | Switching to a redundant/standby system when the primary system fails. |
| **Restore Test** | A drill that actually recovers data from a backup into a working system, proving the backup is usable — not merely confirming a backup file exists. |

## Policy

### 1. Recovery Targets

| Scenario | RTO (target) | RPO (target) |
|---|---|---|
| Application/hosting outage (backend or frontend unavailable, data intact) | 4 hours | 0 (no data loss — data was never at risk) |
| Database unavailability (provider-side outage) | 4 hours, dependent on provider's own recovery | 0 (no data loss — data was never at risk, service is paused not corrupted) |
| Data corruption or accidental deletion requiring restore from backup | 8 hours | 24 hours (i.e., worst case, the most recent daily backup) |
| Full regional/provider outage requiring redeployment to an alternate provider or region | 24 hours | 24 hours |

These targets are set for SellAssist's current scale and architecture (single-region, managed-service-dependent) and are revisited as the platform grows — a larger, higher-traffic SellAssist would justify tighter targets and the added infrastructure cost (multi-region failover, more frequent backups) to hit them.

### 2. Backup Strategy

- The primary database's managed provider performs automated backups on at least a daily cadence, retained on a rolling window sufficient to meet the 24-hour RPO target in §1 with margin for delayed-discovery issues (Document 08 §4).
- Backups are encrypted at rest, consistent with Document 05 §3 and Document 08 §2.
- Application configuration and secrets (Document 08 §3) are documented outside the primary database (in the hosting platform's own configuration store) so that a database restore does not also require reconstructing environment configuration from memory.
- Source code is preserved independently of the production environment via version control, so a full redeploy does not depend on the production server surviving.

### 3. Failover

- SellAssist's current architecture is single-region and does not maintain a hot standby in a second region. A full provider/region outage is recovered by redeploying to an alternate region or provider from version-controlled source and the most recent database backup, within the §1 target for that scenario — this is a cold-start recovery, not an automatic failover, and is the primary reason that scenario's RTO is longer than the others.
- Third-party service dependencies (payment processor, email provider, marketplace APIs) are each single-provider today; an outage on their side is outside SellAssist's direct control and is handled by communicating the dependency's status to affected customers per Document 03 §9, while monitoring the provider's own status channel for resolution.

### 4. Incident Recovery

- Recovery from a security-incident-driven outage (as opposed to a pure infrastructure failure) follows Document 03 §6 (Recovery) — containment and root-cause confirmation happen *before* this plan's restore mechanics are invoked, so that a compromised system is not simply restored back into the same compromised state.
- The Incident Commander (Document 03 §2) directs which recovery path in this document applies to a given incident.

### 5. Communication During an Outage

- For any outage reasonably expected to exceed 30 minutes, affected customers are informed via the most direct available channel, consistent with Document 03 §9's plain-language standard: what's affected, and an honest estimate of resolution time rather than false reassurance.
- Marketplace and payment processor partners are informed per Document 03 §10–11 if the outage affects data flowing to or from their platforms specifically (e.g., a paused publish queue), not merely because SellAssist itself is degraded.

### 6. Testing Schedule

- **Restore test:** at minimum **every 6 months**, a database restore is performed into a non-production environment and verified for data integrity — proving the backup is actually usable, not just present. The first such test has not yet been performed (Document 00) and is the top priority action arising from this plan.
- **Failover/DR tabletop exercise:** at minimum **annually**, run alongside the Document 03 §8 incident response exercise, walking through the full-outage scenario in §1's table without necessarily executing an actual regional failover.
- Every test produces a written record: what was tested, what worked, what didn't, and the actual time taken versus the RTO/RPO target — feeding back into this document as a revision if targets prove unrealistic in either direction.

## Responsibilities

| Role | Responsibility |
|---|---|
| **CISO** | Owns this plan; schedules and confirms execution of the tests in §6. |
| **Owner / Founder** | Holds the access necessary to execute a full redeploy/restore (Document 04 §3, Admin role). |
| **Engineering** | Executes restore tests and documents results; maintains the redeploy process this plan depends on. |

## Review Schedule

Reviewed at minimum every 6 months, aligned with the restore test cadence in §6, and immediately after any real outage or disaster recovery invocation.

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-08-11 | CISO / ISMS Working Group | Initial publication; targets set, first test cycle pending. |

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Owner / Founder | | | |
| CISO (acting) | | | |
