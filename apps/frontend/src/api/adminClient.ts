import type {
  AdminDeleteResult,
  AdminRegistrationFilters,
  AdminRegistrationsResponse,
  AdminStats,
  EventSettings,
  EventSettingsInput,
  EventUpdateResult,
} from '@feria/shared';
import { API_URL, ApiError, ApiValidationError, type FieldErrors } from './client';

// The admin session is gone: never logged in, logged out, or (`expired`) idle for too long.
export class AdminAuthError extends Error {
  readonly expired: boolean;

  constructor(expired: boolean) {
    super(expired ? 'Admin session expired' : 'Not authenticated');
    this.name = 'AdminAuthError';
    this.expired = expired;
  }
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 204) return undefined as T;

  if (res.status === 401) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new AdminAuthError(body?.error === 'session_expired');
  }
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { fieldErrors?: FieldErrors } | null;
    throw new ApiValidationError(body?.fieldErrors ?? {});
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error);
  }
  return res.json() as Promise<T>;
}

export async function fetchAdminSession(): Promise<boolean> {
  const { isAdmin } = await adminRequest<{ isAdmin: boolean }>('/api/admin/me');
  return isAdmin;
}

export async function adminLogin(key: string): Promise<void> {
  await adminRequest('/api/admin/login', { method: 'POST', body: JSON.stringify({ key }) });
}

export async function adminLogout(): Promise<void> {
  await adminRequest('/api/admin/logout', { method: 'POST' });
}

export interface RegistrationQuery extends AdminRegistrationFilters {
  limit?: number;
  offset?: number;
}

function toQueryString(query: RegistrationQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.day) params.set('day', query.day);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function fetchAdminRegistrations(query: RegistrationQuery): Promise<AdminRegistrationsResponse> {
  return adminRequest(`/api/admin/registrations${toQueryString(query)}`);
}

/** A plain link works for the download: the session cookie travels with it and the API
 * answers with a Content-Disposition attachment. The page limit does not apply to the CSV. */
export function adminCsvUrl(filters: AdminRegistrationFilters): string {
  return `${API_URL}/api/admin/registrations.csv${toQueryString(filters)}`;
}

export function fetchAdminStats(): Promise<AdminStats> {
  return adminRequest('/api/admin/stats');
}

export function fetchAdminEvent(): Promise<EventSettings> {
  return adminRequest('/api/admin/event');
}

export function saveAdminEvent(input: EventSettingsInput): Promise<EventUpdateResult> {
  return adminRequest('/api/admin/event', { method: 'PUT', body: JSON.stringify(input) });
}

export async function deleteAdminRegistration(id: string): Promise<void> {
  await adminRequest(`/api/admin/registrations/${id}`, { method: 'DELETE' });
}

/** `expectedCount` is the number the admin was shown: the API deletes nothing (409) if it differs. */
export function deleteOutOfWindowRegistrations(expectedCount: number): Promise<AdminDeleteResult> {
  return adminRequest('/api/admin/registrations/delete-out-of-window', {
    method: 'POST',
    body: JSON.stringify({ expectedCount }),
  });
}
