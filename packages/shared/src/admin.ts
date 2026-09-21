import { z } from 'zod';
import { catalogItemTypeSchema } from './catalog.js';
import { eventDateSchema } from './event.js';

export const adminRegistrationItemSchema = z.object({
  name: z.string(),
  type: catalogItemTypeSchema,
  priceCents: z.number().int().nonnegative(),
});
export type AdminRegistrationItem = z.infer<typeof adminRegistrationItemSchema>;

// GET /api/admin/registrations: one row per confirmed registration, the input
// for building each client's personalized promotions portfolio.
export const adminRegistrationSchema = z.object({
  confirmationId: z.string().uuid(),
  nombre: z.string(),
  apellidos: z.string(),
  email: z.string(),
  attendAt: z.string().datetime().nullable(),
  confirmedAt: z.string().datetime(),
  // True when the visit no longer falls on a configured event day and time.
  outOfWindow: z.boolean(),
  items: z.array(adminRegistrationItemSchema),
  serviceDiscountPct: z.number(),
  productDiscountPct: z.number(),
  servicesTotal: z.number(),
  productsTotal: z.number(),
  grandTotal: z.number(),
});
export type AdminRegistration = z.infer<typeof adminRegistrationSchema>;

export const adminRegistrationsResponseSchema = z.object({
  registrations: z.array(adminRegistrationSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type AdminRegistrationsResponse = z.infer<typeof adminRegistrationsResponseSchema>;

// Query string shared by the registrations list and its CSV export.
export const adminRegistrationFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  day: eventDateSchema.optional(),
});
export type AdminRegistrationFilters = z.infer<typeof adminRegistrationFiltersSchema>;

export const adminLoginSchema = z.object({
  key: z.string({ required_error: 'La clave es requerida', invalid_type_error: 'Clave inválida' }).min(1, 'La clave es requerida'),
});

export const adminStatsSchema = z.object({
  confirmedTotal: z.number().int().nonnegative(),
  byDay: z.array(z.object({ date: eventDateSchema, count: z.number().int().nonnegative() })),
  topItems: z.array(
    z.object({ name: z.string(), type: catalogItemTypeSchema, count: z.number().int().positive() }),
  ),
  draftsStarted: z.number().int().nonnegative(),
  // Confirmed registrations whose visit is no longer on a configured event day.
  outOfWindowCount: z.number().int().nonnegative(),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;

// POST /api/admin/registrations/delete-out-of-window: the admin confirms the number they were
// shown, so a list that changed in the meantime is never deleted by surprise.
export const adminDeleteOutOfWindowSchema = z.object({
  expectedCount: z.number({ required_error: 'La cantidad es requerida' }).int().nonnegative(),
});

export interface AdminDeleteResult {
  deleted: number;
}
