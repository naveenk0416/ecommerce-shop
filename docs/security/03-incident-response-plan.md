# Incident Response Plan

| | |
|---|---|
| **Document Owner** | Chief Information Security Officer (CISO) |
| **Version** | 1.0 |
| **Effective Date** | 2026-08-11 |
| **Classification** | Internal — Confidential |
| **Applies To** | All SellAssist systems, personnel, and connected marketplace/payment integrations |

> **Implementation note:** this plan has not yet been exercised via drill or real incident. See Document 00. An untested plan is a real gap — the first review cycle after publication should include a tabletop exercise (§8).

## Purpose

This plan defines how SellAssist detects, responds to, contains, recovers from, and learns from information security incidents, and how it communicates about them — to affected customers, and to connected marketplace and payment partners — in a timely and legally appropriate manner.

## Scope

Covers any suspected or confirmed event affecting the confidentiality, integrity, or availability of: SellAssist's application and infrastructure, seller account data, marketplace-connected data or credentials, payment-related metadata, or SellAssist source code and secrets.

## Definitions

| Term | Definition |
|---|---|
| **Security Incident** | Any event that has compromised, or could plausibly compromise, confidentiality, integrity, or availability. |
| **Incident Commander (IC)** | The individual with overall authority and responsibility for coordinating response to a specific incident. |
| **Containment** | Action taken to stop an incident from causing further damage while investigation continues. |
| **Root Cause Analysis (RCA)** | A structured post-incident review identifying the underlying cause(s), not just the immediate trigger. |
| **Breach** | A confirmed incident involving unauthorized access to, or disclosure of, personal or confidential data. |

## Policy

### 1. Severity Levels

| Severity | Definition | Example | Initial Response Target |
|---|---|---|---|
| **Sev-1 — Critical** | Active exploitation, confirmed data breach, full platform outage, or compromise of production credentials/secrets. | Attacker has read access to the production database; JWT signing secret is exposed publicly. | Immediate — response begins within 30 minutes of detection, 24/7. |
| **Sev-2 — High** | Significant vulnerability with realistic exploit path, or partial service outage affecting a large share of users. | Authentication bypass discovered; payment webhook signature verification found broken. | Within 4 hours. |
| **Sev-3 — Medium** | Vulnerability or issue with limited blast radius, no evidence of exploitation. | A dependency with a known CVE is in use but not reachable from an untrusted input path. | Within 1 business day. |
| **Sev-4 — Low** | Hardening opportunity, best-practice deviation, no direct exploit path. | Missing security header on a non-sensitive endpoint. | Next scheduled maintenance window. |

Severity is assigned by the Incident Commander at triage and may be revised as investigation proceeds.

### 2. Roles

| Role | Responsibility During an Incident |
|---|---|
| **Incident Commander (IC)** | Owns the incident end-to-end: coordinates responders, makes containment decisions, approves communications, declares resolution. For Sev-1/Sev-2, this is the CISO unless explicitly delegated. |
| **Technical Lead** | Performs or directs the technical investigation, containment, and remediation. May be the same person as the IC in a small team. |
| **Communications Lead** | Drafts and sends customer and marketplace/partner communications per §6 and §7, reviewed by the IC before sending. |
| **Scribe** | Maintains the incident timeline in real time — every action, finding, and decision, with timestamps. Required for Sev-1/Sev-2. |
| **All Personnel** | Report any suspected incident immediately per §3, regardless of role or certainty. |

In a small team, one person may hold multiple roles simultaneously except IC and Scribe, which should remain separate so the IC is not distracted from decision-making by note-taking.

### 3. Detection

Incidents may be identified through:

- Automated alerting (rate-limit threshold breaches, error-rate spikes, failed-login anomalies).
- Manual discovery during development, code review, or dependency scanning (Document 06).
- Reports from users, security researchers, or a connected marketplace partner.
- Reports from a payment processor (e.g., unusual transaction patterns flagged by Razorpay or a future processor).

Any SellAssist personnel who suspects an incident must report it immediately to the CISO (or acting owner) through the fastest available channel — this plan explicitly prioritizes speed of reporting over certainty; a false alarm investigated quickly is preferable to a real incident reported late.

### 4. Investigation

Upon report:

1. The CISO (or delegate) triages within the response target for the suspected severity (§1) and assigns an Incident Commander.
2. The IC opens an incident record and assigns a Scribe (Sev-1/Sev-2).
3. The Technical Lead gathers evidence: relevant logs, affected accounts/records, timeline of first occurrence, and scope (how many users/records/marketplaces affected).
4. Evidence is preserved before remediation destroys it where feasible (e.g., capture logs before rotating a potentially-compromised credential, since rotation may reset audit trails on some providers).
5. The IC classifies the incident's data-sensitivity impact against Document 05's classification levels, which determines notification obligations under §6/§7.

### 5. Containment

Containment actions are chosen to stop ongoing harm with the least disruption necessary, and may include:

- Revoking or rotating a specific compromised credential, API key, or session set.
- Disabling a specific affected feature or endpoint rather than the whole platform, where isolation is possible.
- Blocking a specific malicious IP range or account at the rate-limiter/WAF layer.
- Temporarily disabling a marketplace integration if the compromise involves marketplace-issued credentials, pending that marketplace's own guidance.
- Full platform pause, reserved for Sev-1 incidents where partial containment is not achievable in time.

Every containment action is logged by the Scribe with timestamp, actor, and rationale.

### 6. Recovery

- Recovery begins only once the IC confirms containment is effective (the vulnerability or access path is closed, not merely the symptom hidden).
- Affected systems are restored from a known-good state consistent with Document 09 (Business Continuity & Disaster Recovery Plan).
- Any credential in scope of the incident is rotated, not merely revoked, before the affected system is returned to service.
- The IC declares the incident resolved only after the Technical Lead confirms the root cause (§7 below, at least preliminarily) is addressed, not just the immediate symptom.

### 7. Root Cause Analysis (RCA)

For every Sev-1 and Sev-2 incident, and any Sev-3 incident the CISO elects to escalate:

- A blameless written RCA is produced within 5 business days of resolution.
- The RCA covers: timeline, root cause (not just triggering event), what worked in detection/response, what did not, and concrete follow-up actions with owners and due dates.
- Follow-up actions are tracked to completion — an RCA that produces no completed action is treated as an open finding at the next ISMS review (Document 01).

### 8. Testing

This plan is exercised at minimum **annually** via a tabletop exercise simulating a Sev-1 scenario (e.g., "a marketplace API credential was found in a public GitHub repository"), independent of whether a real incident has occurred. Findings from the exercise feed back into this document as revisions.

### 9. Customer Communication

For any incident confirmed to have affected customer (seller) data or account access:

- Affected customers are notified **without undue delay**, and in any event within the timeframe required by applicable law (e.g., India's Digital Personal Data Protection Act, or a jurisdiction-specific requirement for an affected customer's location).
- Notification states, in plain language: what happened, what data was involved, what SellAssist has done in response, and what the customer should do (e.g., reset password).
- SellAssist does not delay customer notification in order to first complete a full RCA — customers are told what is known at the time, with a commitment to follow up as more is learned.
- All customer-facing incident communication is reviewed by the IC before it is sent.

### 10. Marketplace Security Incident Reporting

SellAssist integrates with multiple marketplace platforms, each of which defines its own security incident reporting requirements as a condition of API access. This plan does not hard-code a single marketplace's process; instead:

> **SellAssist will notify the affected marketplace (Amazon, Flipkart, Meesho, Shopify, or any other connected marketplace) according to the security reporting requirements defined by that marketplace**, without unreasonable delay once an incident is confirmed to involve that marketplace's data, credentials, or API access.

In practice, this means:

- The IC identifies which connected marketplace(s), if any, are in scope of a given incident during Investigation (§4).
- The Communications Lead maintains a current reference of each connected marketplace's specific incident-reporting channel, required timeframe, and required content (these vary by marketplace and are reviewed whenever a new marketplace integration is added).
- Where a marketplace's specific requirement is stricter than this plan's general timeline, the marketplace's requirement governs for communication to that marketplace.
- Marketplace-issued credentials or tokens potentially exposed in the incident are rotated and, where the marketplace's platform requires it, the marketplace is informed of the rotation.

### 11. Payment Processor Communication

Where an incident involves payment-related data or a payment processor integration (e.g., Razorpay), the processor is notified through its designated security channel following the same "without undue delay" standard as §10, since payment processors typically impose their own contractual notification requirements independent of marketplace requirements.

## Responsibilities

| Role | Responsibility |
|---|---|
| **CISO** | Owns this plan, assigns Incident Commanders, approves the annual test exercise. |
| **Incident Commander (per-incident)** | Executes this plan for the duration of a specific incident. |
| **Engineering** | Available to serve as Technical Lead; builds the logging/alerting needed for Detection (§3) per Document 08. |
| **All Personnel** | Report suspected incidents immediately; do not attempt independent remediation of a suspected Sev-1/Sev-2 without IC coordination, to avoid destroying evidence. |

## Review Schedule

Reviewed annually, immediately after every Sev-1 or Sev-2 incident (as part of RCA follow-up), and after every tabletop exercise.

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-08-11 | CISO / ISMS Working Group | Initial publication. |

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Owner / Founder | | | |
| CISO (acting) | | | |
