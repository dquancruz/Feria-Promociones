import type {
  AdminRegistrationsResponse,
  CatalogItem,
  RegistrationConfirmation,
  RegistrationDraftUpdate,
  RegistrationResponse,
} from '@feria/shared';

export const API_URL = import.meta.env.VITE_API_URL ?? '';

export type FieldErrors = Record<string, string | string[] | undefined>;

export class ApiValidationError extends Error {
  readonly fieldErrors: FieldErrors;

  constructor(fieldErrors: FieldErrors) {
    super('Validation failed');
    this.name = 'ApiValidationError';
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 400) {
    const body = (await res.json()) as { fieldErrors?: FieldErrors };
    throw new ApiValidationError(body.fieldErrors ?? {});
  }

  if (!res.ok && res.status !== 409) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function fetchCatalog(search: string): Promise<{ items: CatalogItem[] }> {
  const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  return request(`/api/catalog${query}`);
}

export function fetchDraft(): Promise<RegistrationResponse> {
  return request('/api/registrations/draft');
}

export function patchDraft(update: RegistrationDraftUpdate): Promise<RegistrationResponse> {
  return request('/api/registrations/draft', { method: 'PATCH', body: JSON.stringify(update) });
}

export function confirmRegistration(): Promise<RegistrationConfirmation> {
  return request('/api/registrations/confirm', { method: 'POST' });
}

export async function resetSession(): Promise<void> {
  const res = await fetch(`${API_URL}/api/registrations/session/reset`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Request to /api/registrations/session/reset failed with status ${res.status}`);
  }
}

export class ApiUnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'ApiUnauthorizedError';
  }
}

export async function fetchAdminRegistrations(
  adminKey: string,
  params: { limit: number; offset: number },
): Promise<AdminRegistrationsResponse> {
  const query = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
  const res = await fetch(`${API_URL}/api/admin/registrations?${query}`, {
    headers: { 'x-admin-key': adminKey },
  });

  if (res.status === 401) throw new ApiUnauthorizedError();
  if (!res.ok) {
    throw new Error(`Request to /api/admin/registrations failed with status ${res.status}`);
  }
  return res.json() as Promise<AdminRegistrationsResponse>;
}
