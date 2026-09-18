import { z } from 'zod';

// GET /api/admin/registrations: one row per confirmed registration, the input
// for building each client's personalized promotions portfolio.
export const adminRegistrationSchema = z.object({
  confirmationId: z.string().uuid(),
  nombre: z.string(),
  apellidos: z.string(),
  email: z.string(),
  attendAt: z.string().datetime().nullable(),
  confirmedAt: z.string().datetime(),
  items: z.array(z.string()),
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
