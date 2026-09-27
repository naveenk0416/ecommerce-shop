import type express from 'express';
import { User } from '../api/common.js';

/** Response header carrying the seller's current coin balance as "free,paid". */
export const COIN_BALANCE_HEADER = 'X-Coin-Balance';

/**
 * Any response that may have changed coins (AI listing, refund, bonus, referral, top-up,
 * purchase) carries the new balance in a header, so the header pill updates immediately without
 * reloading the wallet. A header rather than a body field so it never ends up stored on a listing
 * that the client later sends back.
 */
export async function setCoinBalanceHeader(res: express.Response, uid: string): Promise<void> {
  try {
    const user = await User.findById(uid).select('coins walletInitAt').lean();
    if (!user?.walletInitAt) return;
    res.setHeader(COIN_BALANCE_HEADER, `${user.coins?.free ?? 0},${user.coins?.paid ?? 0}`);
  } catch {
    // Best effort — the wallet page still shows the right balance.
  }
}

/** Same, from a balance already in hand. */
export function setCoinBalanceHeaderFrom(res: express.Response, balance: { free: number; paid: number }): void {
  res.setHeader(COIN_BALANCE_HEADER, `${balance.free},${balance.paid}`);
}
