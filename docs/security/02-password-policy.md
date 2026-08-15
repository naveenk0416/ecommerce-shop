# Password Policy

| | |
|---|---|
| **Document Owner** | Chief Information Security Officer (CISO) |
| **Version** | 1.0 |
| **Effective Date** | 2026-08-11 |
| **Classification** | Internal — Confidential |
| **Applies To** | All SellAssist user accounts (customer and administrative) |

> **Implementation note:** see Document 00 for current status. At time of writing, SellAssist enforces an 8-character minimum with full character-class complexity; the 12-character minimum below is the target standard this policy requires the platform to be raised to.

## Purpose

This policy defines the minimum strength, handling, and lifecycle requirements for passwords used to authenticate to SellAssist, for both customer (seller) accounts and internal administrative accounts. It exists to reduce the risk of account compromise through credential guessing, credential stuffing, and brute-force attack.

## Scope

Applies to every password-authenticated account on the SellAssist platform: seller/customer accounts, internal administrative accounts, and any service account that authenticates with a password rather than a certificate or key.

## Definitions

| Term | Definition |
|---|---|
| **Complexity requirement** | A rule requiring a password to include specific character classes. |
| **Credential stuffing** | An attack using breached username/password pairs from other services against SellAssist's login. |
| **Brute force** | An attack attempting many password guesses against a single account. |
| **Salting** | A unique random value added to a password before hashing, preventing precomputed (rainbow-table) attacks. bcrypt performs this automatically as part of its hash. |
| **Account lockout** | A temporary block on authentication attempts for a specific account following repeated failures. |

## Policy

### 1. Password Strength Requirements

All passwords set on the SellAssist platform — at registration, at password reset, and at password change — must meet:

- **Minimum length: 12 characters.**
- At least one **uppercase** letter (A–Z).
- At least one **lowercase** letter (a–z).
- At least one **number** (0–9).
- At least one **special character** (e.g. `! @ # $ % ^ & * ( ) - _ + =`).
- Must not be identical to the account's email address or any part of it.
- Must not match any password in a maintained breached-password list (see §6, Roadmap).

These rules are enforced **server-side** on every password-setting endpoint (registration, password reset, password change) — client-side validation exists for user experience only and is never trusted as the sole enforcement point, consistent with Document 07 §Input Validation.

### 2. Password Storage

- Passwords are never stored, logged, or transmitted in plaintext, at rest or in transit.
- Passwords are hashed using **bcrypt** with a minimum cost factor of 10 before storage. The cost factor is reviewed against current hardware capability at each annual policy review and increased if bcrypt's recommended minimum has risen.
- Password hashes are never included in any API response, log line, or error message under any circumstance.

### 3. Multi-Factor Authentication (MFA)

- MFA (time-based one-time password, at minimum) is **required** for all internal administrative accounts (see Document 04, Admin role).
- MFA is **offered and strongly encouraged** for all customer accounts, and is required for any customer account granted elevated in-product permissions.
- Recovery/backup codes for MFA are generated once, shown to the user a single time, and stored server-side only in hashed form.

### 4. Password Rotation

- SellAssist does **not** enforce mandatory periodic password rotation for accounts without evidence of compromise. Forced periodic rotation is a deprecated practice (per NIST SP 800-63B guidance) that tends to produce weaker, more predictable passwords.
- Passwords **are** force-rotated (the account is required to set a new password on next login) when:
  - There is evidence or reasonable suspicion the account's credentials were exposed (breach notification, credential-stuffing detection, confirmed incident).
  - An administrator manually flags the account following a support/security investigation.

### 5. Account Lockout

- After **5 consecutive failed login attempts** on a single account within a 15-minute window, the account enters a temporary lockout state.
- Lockout duration is 15 minutes, or until the legitimate owner completes a password reset, whichever is sooner.
- Lockout state does not reveal to the person attempting login whether the account exists (the same generic message is shown for "no such account," "wrong password," and "locked" states — see Document 04's anti-enumeration principle) except once a threshold is reached, at which point a generic "too many attempts, try again later" message is acceptable since it does not confirm account existence.
- Repeated lockouts on the same account within a short period trigger a security event for review (Document 03).

### 6. Password Reset

- Password reset is self-service via a time-limited, single-use token sent to the account's verified email address.
- Reset tokens are cryptographically random, stored **hashed** (never in plaintext) server-side, and expire **30 minutes** after issuance.
- A reset token is invalidated immediately upon use, and immediately upon a new reset request superseding it.
- Completing a password reset invalidates all existing sessions for that account (see Document 04, Session Management).
- The "forgot password" endpoint returns the same response whether or not the submitted email is registered, to prevent account enumeration.

### 7. Administrator Password Policy

Administrative accounts (Document 04's Admin role) are held to a stricter standard than customer accounts:

- Minimum **16 characters**, same complexity rules as above.
- MFA is mandatory, not optional, with no grace period.
- Administrative passwords may not be reused across any other SellAssist account or, to the account holder's knowledge, any other service.
- Administrative accounts are force-rotated every **90 days** in addition to the compromise-triggered rotation in §4, given the elevated blast radius of an administrative account compromise.
- Shared administrative credentials are prohibited — every administrator authenticates as themselves, individually, so actions are attributable (see Document 03, Investigation).

## Responsibilities

| Role | Responsibility |
|---|---|
| **Engineering** | Implements and maintains server-side enforcement of every rule in this policy; ensures no code path can set a password that violates it. |
| **CISO** | Reviews this policy annually against current industry guidance (e.g., NIST SP 800-63B); approves any deviation. |
| **All Account Holders** | Choose passwords meeting this policy; do not share credentials; report suspected compromise immediately. |
| **Administrators** | Comply with the stricter administrator requirements in §7 without exception. |

## Review Schedule

Reviewed annually, and immediately following any password-related security incident.

## Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-08-11 | CISO / ISMS Working Group | Initial publication. |

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Owner / Founder | | | |
| CISO (acting) | | | |
