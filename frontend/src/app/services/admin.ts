import { Injectable } from '@angular/core';
import { apiFetch } from './api';
import { Listing } from './listing';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  phoneNumber?: string;
  gstNumber?: string;
  role: string;
  usageCount: number;
  lastLogin: string;
  dailyStats?: {
    date: string;
    count: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  async getAllUsers(): Promise<UserProfile[]> {
    return apiFetch<UserProfile[]>('/admin/users');
  }

  async getAllListings(): Promise<Listing[]> {
    return apiFetch<Listing[]>('/admin/listings');
  }

  async createUser(data: { email: string; password: string; displayName?: string; role?: string }) {
    return apiFetch<UserProfile>('/admin/users', {
      method: 'POST',
      body: data
    });
  }

  async deleteUser(uid: string) {
    return apiFetch(`/admin/users/${encodeURIComponent(uid)}`, {
      method: 'DELETE'
    });
  }

  async createListing(data: Partial<Listing> & { uid: string; name: string }) {
    return apiFetch<Listing>('/admin/listings', {
      method: 'POST',
      body: data
    });
  }

  async deleteUserListing(listingId: string) {
    return apiFetch(`/admin/listings/${encodeURIComponent(listingId)}`, {
      method: 'DELETE'
    });
  }

  async updateUserListing(listingId: string, data: Partial<Listing>) {
    return apiFetch(`/admin/listings/${encodeURIComponent(listingId)}`, {
      method: 'PATCH',
      body: data
    });
  }

  /** Edits a user's profile/role. Backend restricts the `role` field to admin callers. */
  async updateUser(uid: string, updates: Partial<Pick<UserProfile, 'displayName' | 'phoneNumber' | 'gstNumber' | 'role'>>) {
    return apiFetch(`/users/${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      body: updates
    });
  }
}
