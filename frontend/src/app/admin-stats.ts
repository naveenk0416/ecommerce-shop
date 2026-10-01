import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { apiBase, apiFetch, getAuthToken } from './services/api';
import { MARKETPLACE_OPTIONS } from './config/signup-options';

interface AdminStatsData {
  filters: { from: string; to: string; campaign: string | null; ref: string | null };
  signups: number;
  verifiedPct: number;
  activationPct: number;
  activatedUsers: number;
  week2RetentionPct: number;
  week2EligibleUsers: number;
  catalogSizeBand: Record<string, number>;
  /** "Where do you sell?" — sellers can pick several, so shares add up to more than 100%. */
  marketplaces?: {
    signups: number;
    respondents: number;
    respondentsPct: number;
    rows: { value: string; sellers: number; pctOfRespondents: number; pctOfSignups: number }[];
    otherAnswers: { text: string; sellers: number }[];
  };
  catalogSizeImported: { users: number; median: number | null; average: number | null; buckets: Record<string, number> };
  aiListingsPerActiveUserFirst7Days: number;
  aiListingsPerActiveUserFirst30Days: number;
  usedAllFreeCoinsPct: number;
  notifyMe: { clicks: number; users: number };
  /** Sellers who asked to be told when a not-yet-live feature launches, by feature. */
  featureNotifyMe?: Record<string, number>;
  funnel?: {
    total: FunnelRow;
    campaigns: FunnelRow[];
    guest: { generated: number; failed: number; savedAfterSignup: number; limits: { perDevice: number; perIpPerDay: number; globalPerDay: number } };
  };
  abuse?: {
    events: Record<string, number>;
    networksWithManySignups: { network: string; signups: number; withoutWelcome: number }[];
    devicesWithManySignups: { device: string; signups: number }[];
    unverifiedOlderThanDays: number;
    unverifiedTotal: number;
    unverified: { userId: string; createdAt: string; emailDomain: string; aiListings: number }[];
  };
  bonusCompletionPct: Record<string, number>;
  referrals: { referredSignups: number; pending: number; rewarded: number; blocked: number; blockedReasons: Record<string, number>; reversed: number; signupsFromReferralLinks: number };
  packs: {
    enabled: boolean;
    purchasesByPack: Record<string, { name: string; count: number; revenueInr: number }>;
    revenueInr: number;
    payingUsers: number;
    starterOffersShown: number;
    starterPurchases: number;
    starterConversionPct: number;
  };
  aiCost: {
    totalInr: number;
    perActiveUserInr: number;
    perPayingUserInr: number;
    byPurpose: { purpose: string; calls: number; successful: number; inputTokens: number; outputTokens: number; costInr: number }[];
  };
}

interface FunnelRow {
  campaign: string;
  steps: { step: string; count: number; pctOfPrevious: number | null }[];
  guest: Record<string, number>;
}

const STEP_LABELS: Record<string, string> = {
  landing_view: 'Visits',
  signup_view: 'Sign-up page',
  sign_up_start: 'Started form',
  sign_up: 'Signed up',
  first_listing_created: 'First listing',
};

const ABUSE_LABELS: Record<string, string> = {
  disposable_email: 'Disposable email blocked',
  welcome_blocked_device: 'No welcome coins — 2nd+ account on a device',
  welcome_blocked_ip: 'No welcome coins — too many sign-ups from one network',
  guest_cap_device: 'Guest try blocked — device already used it',
  guest_cap_ip: 'Guest try blocked — network daily limit',
  guest_cap_global: 'Guest try blocked — global daily limit',
};

const PURPOSE_LABELS: Record<string, string> = {
  listing: 'AI listings (1 coin each)',
  field_fix: '✨ Field fixes (free)',
  marketplace_autofill: 'Fill empty fields with AI (free)',
  guest_listing: 'Guest try on landing page (free, no account)',
};

const FEATURE_LABELS: Record<string, string> = {
  flipkart_publish: 'Flipkart publishing',
  meesho_publish: 'Meesho publishing',
  instagram_publish: 'Instagram publishing',
};

const BONUS_LABELS: Record<string, string> = {
  welcome: 'Welcome bonus',
  mobile: 'Mobile number',
  firstInventorySave: 'First Save to Inventory',
  firstPublish: 'First publish',
};

function isoDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

/** Admin → growth, coins and AI cost, filterable by sign-up date and campaign / referral code. */
@Component({
  selector: 'app-admin-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe],
  template: `
    <section class="stats" aria-labelledby="admin-stats-title">
      <div class="stats__head">
        <h3 id="admin-stats-title" class="stats__title">Growth, coins &amp; AI cost</h3>
        <form class="stats__filters" (ngSubmit)="load()">
          <label>From <input type="date" name="from" [(ngModel)]="from" /></label>
          <label>To <input type="date" name="to" [(ngModel)]="to" /></label>
          <label>utm_campaign <input type="text" name="campaign" [(ngModel)]="campaign" placeholder="e.g. surat_hindi" /></label>
          <label>Referral code <input type="text" name="ref" [(ngModel)]="ref" placeholder="e.g. AB12CD3" /></label>
          <button type="submit" class="btn-secondary h-9 px-4" [disabled]="loading()">{{ loading() ? 'Loading…' : 'Apply' }}</button>
          <button type="button" class="btn-secondary h-9 px-4" (click)="download('summary')">Summary CSV</button>
          <button type="button" class="btn-secondary h-9 px-4" (click)="download('users')">Per-seller CSV</button>
        </form>
      </div>

      @if (error()) {
        <p class="stats__error" role="alert">{{ error() }}</p>
      }

      @if (stats(); as s) {
        <div class="stats__kpis">
          <div class="kpi"><span>Sign-ups</span><strong>{{ s.signups }}</strong></div>
          <div class="kpi"><span>Verified</span><strong>{{ s.verifiedPct }}%</strong></div>
          <div class="kpi"><span>Activation (≥1 AI listing)</span><strong>{{ s.activationPct }}%</strong></div>
          <div class="kpi"><span>Week-2 retention</span><strong>{{ s.week2RetentionPct }}%</strong><small>of {{ s.week2EligibleUsers }} activated, 14+ days old</small></div>
          <div class="kpi"><span>Used all free coins</span><strong>{{ s.usedAllFreeCoinsPct }}%</strong></div>
          <div class="kpi"><span>AI listings / active user</span><strong>{{ s.aiListingsPerActiveUserFirst7Days }} · {{ s.aiListingsPerActiveUserFirst30Days }}</strong><small>first 7 · 30 days</small></div>
        </div>

        <div class="stats__grid">
          <div class="panel">
            <h4>How many products do you sell? (sign-up answer)</h4>
            <table>
              <thead><tr><th scope="col">Band</th><th scope="col" class="num">Sellers</th><th scope="col" class="num">Share</th></tr></thead>
              <tbody>
                @for (row of bandRows(); track row.band) {
                  <tr><td>{{ row.band }}</td><td class="num">{{ row.count }}</td><td class="num">{{ row.pct }}%</td></tr>
                }
              </tbody>
            </table>
          </div>

          @if (s.marketplaces; as m) {
            <div class="panel" data-testid="admin-marketplaces">
              <h4>Where do you sell?</h4>
              <p class="panel__meta">{{ m.respondents }} of {{ m.signups }} sign-ups answered ({{ m.respondentsPct }}%) · several choices allowed
                · <button type="button" class="panel__link" (click)="download('marketplaces')">Export CSV</button></p>
              <table>
                <thead><tr><th scope="col">Marketplace</th><th scope="col" class="num">Sellers</th><th scope="col" class="num">% of answered</th><th scope="col" class="num">% of sign-ups</th></tr></thead>
                <tbody>
                  @for (row of m.rows; track row.value) {
                    <tr><td>{{ marketplaceLabel(row.value) }}</td><td class="num">{{ row.sellers }}</td><td class="num">{{ row.pctOfRespondents }}%</td><td class="num">{{ row.pctOfSignups }}%</td></tr>
                  }
                </tbody>
              </table>
              @if (m.otherAnswers.length) {
                <p class="panel__meta">Other: @for (o of m.otherAnswers; track o.text) { <span>{{ o.text }} ({{ o.sellers }})@if (!$last) {, }</span> }</p>
              }
            </div>
          }

          <div class="panel">
            <h4>Products imported via Sync</h4>
            <p class="panel__meta">{{ s.catalogSizeImported.users }} sellers synced · median {{ s.catalogSizeImported.median ?? '—' }} · average {{ s.catalogSizeImported.average ?? '—' }}</p>
            <table>
              <thead><tr><th scope="col">Imported products</th><th scope="col" class="num">Sellers</th></tr></thead>
              <tbody>
                @for (row of importedRows(); track row.band) {
                  <tr><td>{{ row.band }}</td><td class="num">{{ row.count }}</td></tr>
                }
              </tbody>
            </table>
          </div>

          <div class="panel">
            <h4>Bonuses &amp; referrals</h4>
            <table>
              <tbody>
                @for (row of bonusRows(); track row.label) {
                  <tr><td>{{ row.label }}</td><td class="num">{{ row.pct }}% done</td></tr>
                }
                <tr><td>Sign-ups from referral links</td><td class="num">{{ s.referrals.signupsFromReferralLinks }}</td></tr>
                <tr><td>Referrals rewarded / pending / blocked</td><td class="num">{{ s.referrals.rewarded }} / {{ s.referrals.pending }} / {{ s.referrals.blocked }}</td></tr>
                <tr><td>Referral rewards reversed</td><td class="num">{{ s.referrals.reversed }}</td></tr>
                <tr><td>"Notify me" clicks (sellers)</td><td class="num">{{ s.notifyMe.clicks }} ({{ s.notifyMe.users }})</td></tr>
                @for (row of featureNotifyRows(); track row.feature) {
                  <tr><td>"Notify me": {{ row.label }} (sellers)</td><td class="num">{{ row.count }}</td></tr>
                }
              </tbody>
            </table>
          </div>

          <div class="panel">
            <h4>Coin packs {{ s.packs.enabled ? '' : '(off)' }}</h4>
            <table>
              <thead><tr><th scope="col">Pack</th><th scope="col" class="num">Bought</th><th scope="col" class="num">Revenue</th></tr></thead>
              <tbody>
                @for (row of packRows(); track row.id) {
                  <tr><td>{{ row.name }}</td><td class="num">{{ row.count }}</td><td class="num">₹{{ row.revenueInr | number }}</td></tr>
                } @empty {
                  <tr><td colspan="3" class="muted">No purchases yet.</td></tr>
                }
                <tr><td><strong>Total</strong> ({{ s.packs.payingUsers }} paying)</td><td></td><td class="num"><strong>₹{{ s.packs.revenueInr | number }}</strong></td></tr>
                <tr><td>Starter offer: shown → bought</td><td class="num" colspan="2">{{ s.packs.starterOffersShown }} → {{ s.packs.starterPurchases }} ({{ s.packs.starterConversionPct }}%)</td></tr>
              </tbody>
            </table>
          </div>

          <div class="panel panel--wide">
            <h4>AI cost</h4>
            <p class="panel__meta">Total ₹{{ s.aiCost.totalInr | number: '1.2-2' }} · per active user ₹{{ s.aiCost.perActiveUserInr | number: '1.2-2' }} · per paying user ₹{{ s.aiCost.perPayingUserInr | number: '1.2-2' }}</p>
            <div class="scroll">
              <table>
                <thead><tr><th scope="col">Call type</th><th scope="col" class="num">Calls</th><th scope="col" class="num">Succeeded</th><th scope="col" class="num">Input tokens</th><th scope="col" class="num">Output tokens</th><th scope="col" class="num">Cost</th></tr></thead>
                <tbody>
                  @for (row of s.aiCost.byPurpose; track row.purpose) {
                    <tr>
                      <td>{{ purposeLabel(row.purpose) }}</td>
                      <td class="num">{{ row.calls | number }}</td>
                      <td class="num">{{ row.successful | number }}</td>
                      <td class="num">{{ row.inputTokens | number }}</td>
                      <td class="num">{{ row.outputTokens | number }}</td>
                      <td class="num">₹{{ row.costInr | number: '1.2-2' }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="muted">No AI calls in this period.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          @if (s.funnel; as f) {
            <div class="panel panel--wide" data-testid="funnel-table">
              <h4>Sign-up funnel by campaign</h4>
              <p class="panel__meta">Unique visitors (browser) per step in this date range · % = of the previous step</p>
              <div class="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">utm_campaign</th>
                      @for (step of f.total.steps; track step.step) { <th scope="col" class="num">{{ stepLabel(step.step) }}</th> }
                      <th scope="col" class="num">Guest tries (done → sign-up click)</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of funnelRows(); track row.campaign) {
                      <tr>
                        <td>{{ row.campaign }}</td>
                        @for (step of row.steps; track step.step) {
                          <td class="num">{{ step.count }}@if (step.pctOfPrevious !== null) { <small class="muted"> ({{ step.pctOfPrevious }}%)</small> }</td>
                        }
                        <td class="num">{{ row.guest['guest_try_start'] }} ({{ row.guest['guest_try_success'] }} → {{ row.guest['guest_try_signup_click'] }})</td>
                      </tr>
                    } @empty {
                      <tr><td colspan="7" class="muted">No visits recorded in this period yet.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="panel__meta">Guest listings: {{ f.guest.generated }} generated · {{ f.guest.failed }} failed · {{ f.guest.savedAfterSignup }} saved to an account after sign-up · limits {{ f.guest.limits.perDevice }}/device, {{ f.guest.limits.perIpPerDay }}/network/day, {{ f.guest.limits.globalPerDay }}/day</p>
            </div>
          }

          @if (s.abuse; as a) {
            <div class="panel">
              <h4>Suspicious sign-ups</h4>
              <table>
                <tbody>
                  @for (row of abuseRows(); track row.type) {
                    <tr><td>{{ row.label }}</td><td class="num">{{ row.count }}</td></tr>
                  } @empty {
                    <tr><td class="muted">Nothing blocked in this period.</td></tr>
                  }
                  @for (n of a.networksWithManySignups; track n.network) {
                    <tr><td>Network {{ n.network }}… — {{ n.signups }} sign-ups</td><td class="num">{{ n.withoutWelcome }} without welcome</td></tr>
                  }
                  @for (d of a.devicesWithManySignups; track d.device) {
                    <tr><td>Device {{ d.device }}… — accounts</td><td class="num">{{ d.signups }}</td></tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="panel" data-testid="unverified-list">
              <h4>Unverified accounts older than {{ a.unverifiedOlderThanDays }} days ({{ a.unverifiedTotal }})</h4>
              <p class="panel__meta">For manual clean-up — nothing is deleted automatically.</p>
              <div class="scroll scroll--short">
                <table>
                  <thead><tr><th scope="col">User id</th><th scope="col">Signed up</th><th scope="col">Email domain</th><th scope="col" class="num">AI listings</th></tr></thead>
                  <tbody>
                    @for (u of a.unverified; track u.userId) {
                      <tr><td><code>{{ u.userId }}</code></td><td>{{ u.createdAt.slice(0, 10) }}</td><td>{{ u.emailDomain }}</td><td class="num">{{ u.aiListings }}</td></tr>
                    } @empty {
                      <tr><td colspan="4" class="muted">None.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .stats { display: flex; flex-direction: column; gap: 16px; }
    .stats__head { display: flex; flex-direction: column; gap: 10px; }
    .stats__title { margin: 0 8px; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.2em; }
    .stats__filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
    .stats__filters label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; font-weight: 700; color: #64748b; }
    .stats__filters input { height: 36px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0 10px; font-size: 13px; background: #fff; }
    .stats__error { margin: 0; color: #b91c1c; font-size: 13px; }
    .stats__kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .kpi { background: #fff; border: 1px solid #f1f5f9; border-radius: 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
    .kpi span { font-size: 11px; font-weight: 700; color: #64748b; }
    .kpi strong { font-size: 22px; font-weight: 900; color: #0f172a; }
    .kpi small { font-size: 11px; color: #94a3b8; }
    .stats__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .panel { background: #fff; border: 1px solid #f1f5f9; border-radius: 16px; padding: 14px; min-width: 0; }
    .panel--wide { grid-column: 1 / -1; }
    .panel h4 { margin: 0 0 8px; font-size: 13px; font-weight: 800; color: #0f172a; }
    .panel__meta { margin: 0 0 8px; font-size: 12px; color: #64748b; }
    .panel__link { background: none; border: 0; padding: 0; color: #c2410c; font-size: 12px; font-weight: 700; text-decoration: underline; cursor: pointer; }
    .scroll { overflow-x: auto; }
    .scroll--short { max-height: 280px; overflow-y: auto; }
    code { font-size: 11px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-size: 11px; color: #64748b; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
    td { padding: 6px 8px; border-bottom: 1px solid #f8fafc; color: #0f172a; }
    .num { text-align: right; white-space: nowrap; }
    .muted { color: #94a3b8; }
    @media (max-width: 768px) { .stats__grid { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class AdminStats {
  from = isoDay(new Date(Date.now() - 90 * 24 * 3600e3));
  to = isoDay(new Date());
  campaign = '';
  ref = '';

  stats = signal<AdminStatsData | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  bandRows = computed(() => {
    const s = this.stats();
    if (!s) return [];
    const total = Object.values(s.catalogSizeBand).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(s.catalogSizeBand).map(([band, count]) => ({ band, count, pct: Math.round((count / total) * 1000) / 10 }));
  });

  importedRows = computed(() => Object.entries(this.stats()?.catalogSizeImported.buckets ?? {}).map(([band, count]) => ({ band, count })));
  bonusRows = computed(() => Object.entries(this.stats()?.bonusCompletionPct ?? {}).map(([id, pct]) => ({ label: BONUS_LABELS[id] ?? id, pct })));
  packRows = computed(() => Object.entries(this.stats()?.packs.purchasesByPack ?? {}).map(([id, row]) => ({ id, ...row })));
  funnelRows = computed(() => {
    const f = this.stats()?.funnel;
    return f ? [f.total, ...f.campaigns] : [];
  });
  abuseRows = computed(() => Object.entries(this.stats()?.abuse?.events ?? {}).map(([type, count]) => ({ type, label: ABUSE_LABELS[type] ?? type, count })));

  marketplaceLabel(value: string): string {
    return MARKETPLACE_OPTIONS.find((o) => o.value === value)?.en ?? value;
  }

  stepLabel(step: string): string {
    return STEP_LABELS[step] ?? step;
  }

  featureNotifyRows = computed(() => Object.entries(this.stats()?.featureNotifyMe ?? {}).map(([feature, count]) => ({ feature, label: FEATURE_LABELS[feature] ?? feature, count })));

  constructor() {
    void this.load();
  }

  private query(): string {
    const params = new URLSearchParams({ from: this.from, to: this.to });
    if (this.campaign.trim()) params.set('campaign', this.campaign.trim());
    if (this.ref.trim()) params.set('ref', this.ref.trim());
    return params.toString();
  }

  purposeLabel(purpose: string): string {
    return PURPOSE_LABELS[purpose] ?? purpose;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.stats.set(await apiFetch<AdminStatsData>(`/admin/stats?${this.query()}`));
    } catch (error) {
      this.error.set((error instanceof Error && error.message) || 'Could not load stats.');
    } finally {
      this.loading.set(false);
    }
  }

  /** CSV needs the auth header, so it is fetched and saved as a blob rather than linked. */
  async download(type: 'summary' | 'users' | 'marketplaces'): Promise<void> {
    this.error.set(null);
    try {
      const response = await fetch(`${apiBase}/admin/stats.csv?type=${type}&${this.query()}`, {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` },
      });
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sellassist-stats-${type}-${this.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.error.set((error instanceof Error && error.message) || 'Download failed.');
    }
  }
}
