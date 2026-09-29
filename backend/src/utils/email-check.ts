import { promises as dns } from 'node:dns';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { coinConfig } from '../config/coins.js';

/**
 * Sign-up email checks: disposable domains (maintained list, refreshed with
 * `npm run disposable:update`), common typos of big providers ("Did you mean gmail.com?") and
 * whether the domain can receive mail at all (MX records).
 */

function loadDomainFile(name: string): Set<string> {
  const path = fileURLToPath(new URL(`../../config/${name}`, import.meta.url));
  if (!existsSync(path)) return new Set();
  return new Set(readFileSync(path, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')));
}

const DISPOSABLE = loadDomainFile('disposable-email-domains.txt');
const ALLOWLIST = loadDomainFile('disposable-email-allowlist.txt');
if (DISPOSABLE.size === 0) console.warn('[email-check] disposable-email-domains.txt is missing — run npm run disposable:update');

/** Misspellings of the providers Indian sellers actually use. */
const TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.in': 'gmail.com', 'gmailcom': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmsil.com': 'gmail.com', 'gmail.om': 'gmail.com', 'g.mail.com': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yaho.in': 'yahoo.in', 'yahoo.co': 'yahoo.co.in',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'homail.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'rediffmai.com': 'rediffmail.com', 'redifmail.com': 'rediffmail.com', 'rediffmail.con': 'rediffmail.com',
  'iclod.com': 'icloud.com', 'icloud.con': 'icloud.com',
};

export interface EmailCheck {
  ok: boolean;
  code?: 'INVALID_EMAIL' | 'DISPOSABLE_EMAIL' | 'EMAIL_DOMAIN_INVALID' | 'EMAIL_TYPO';
  error?: string;
  /** EMAIL_TYPO: the address with the domain corrected, e.g. user@gmail.com. */
  suggestion?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailDomain(email: string): string {
  return email.split('@').pop()?.toLowerCase().trim() ?? '';
}

export function isDisposableDomain(domain: string): boolean {
  if (ALLOWLIST.has(domain)) return false;
  // Subdomains of a listed domain count too (x.mailinator.com).
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

type MxResolver = (domain: string) => Promise<boolean>;

/** True if the domain has MX records; errors other than "no such domain / no records" count as ok. */
const realMxResolver: MxResolver = async (domain) => {
  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 3000)),
    ]);
    return records.length > 0;
  } catch (err: any) {
    return !['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(err?.code);
  }
};
let mxResolver: MxResolver = realMxResolver;

/** Tests replace the DNS lookup. */
export function setMxResolverForTests(fn: MxResolver | null): void {
  mxResolver = fn ?? realMxResolver;
}

export async function checkSignupEmail(rawEmail: unknown): Promise<EmailCheck> {
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, code: 'INVALID_EMAIL', error: 'Enter a valid email address.' };
  const domain = emailDomain(email);
  const fixed = TYPOS[domain];
  if (fixed) {
    const suggestion = `${email.slice(0, email.lastIndexOf('@'))}@${fixed}`;
    return { ok: false, code: 'EMAIL_TYPO', error: `Did you mean ${fixed}?`, suggestion };
  }
  if (isDisposableDomain(domain)) return { ok: false, code: 'DISPOSABLE_EMAIL', error: 'Please use your real email address.' };
  if (coinConfig.signup.mxCheck && !(await mxResolver(domain))) {
    return { ok: false, code: 'EMAIL_DOMAIN_INVALID', error: `${domain} can't receive email. Please check the address.` };
  }
  return { ok: true };
}
