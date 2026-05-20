import { Injectable } from '@angular/core';
import { Listing } from './listing';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  lastLogin: string;
  role?: 'admin' | 'seller' | 'buyer';
}

export interface DashboardPayload {
  users: UserProfile[];
  listings: Listing[];
  source: 'mongodb' | 'fallback';
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  async getDashboardData(): Promise<DashboardPayload> {
    const res = await fetch('/api/admin/dashboard');
    if (!res.ok) throw new Error('Failed to load dashboard data');
    return res.json();
  }

  async deleteUserListing(_listingId: string) {
    // TODO: Add MongoDB delete endpoint
    return;
  }
}
