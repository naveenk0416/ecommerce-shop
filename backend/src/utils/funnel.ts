import { FunnelEvent } from '../api/common.js';

/** Steps sent by the browser (POST /api/events). */
export const CLIENT_FUNNEL_EVENTS = [
  'landing_view', 'signup_view', 'sign_up_start', 'signup_submit',
  'guest_try_start', 'guest_try_success', 'guest_try_signup_click',
] as const;

/** Steps recorded by the server itself, where the outcome is known. */
export const SERVER_FUNNEL_EVENTS = ['sign_up', 'email_verified', 'first_listing_created', 'onboarding_details_added'] as const;

export type FunnelEventName = (typeof CLIENT_FUNNEL_EVENTS)[number] | (typeof SERVER_FUNNEL_EVENTS)[number];

function clean(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim().slice(0, 100) : '';
  return text || undefined;
}

/** Stores one funnel step. Never throws — tracking must not break the request it rides on. */
export async function recordFunnelEvent(
  name: FunnelEventName,
  who: { uid?: string; deviceId?: string | null; utm_source?: unknown; utm_campaign?: unknown },
): Promise<void> {
  try {
    await FunnelEvent.create({
      name,
      uid: who.uid,
      deviceId: who.deviceId ?? undefined,
      utm_source: clean(who.utm_source),
      utm_campaign: clean(who.utm_campaign),
    });
  } catch (err) {
    console.error('[funnel] event not stored', name, err);
  }
}

/** Server-side step for a signed-up seller: browser id and campaign come from their account. */
export function recordUserFunnelEvent(name: FunnelEventName, user: any): Promise<void> {
  return recordFunnelEvent(name, {
    uid: user._id.toString(),
    deviceId: user.signupDeviceId,
    utm_source: user.attribution?.utm_source,
    utm_campaign: user.attribution?.utm_campaign,
  });
}
