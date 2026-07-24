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
}
