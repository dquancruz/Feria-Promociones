import { z } from 'zod';

export const registrationStatusSchema = z.enum(['draft', 'confirmed']);
export type RegistrationStatus = z.infer<typeof registrationStatusSchema>;

// PATCH /api/registrations/draft request body: any subset of the draft fields.
export const registrationDraftUpdateSchema = z.object({
  nombre: z.string().optional(),
  apellidos: z.string().optional(),
  email: z.union([z.literal(''), z.string().email()]).optional(),
  attendAt: z.string().datetime().nullable().optional(),
  selectedItemIds: z.array(z.string().uuid()).optional(),
});
export type RegistrationDraftUpdate = z.infer<typeof registrationDraftUpdateSchema>;

export const discountPreviewSchema = z.object({
  serviceDiscountPct: z.number(),
  productDiscountPct: z.number(),
});
export type DiscountPreview = z.infer<typeof discountPreviewSchema>;

// GET/PATCH /api/registrations/draft response shape while status is "draft".
export const registrationDraftSchema = z.object({
  status: z.literal('draft'),
  nombre: z.string(),
  apellidos: z.string(),
  email: z.string(),
  attendAt: z.string().datetime().nullable(),
  selectedItemIds: z.array(z.string().uuid()),
  discountPreview: discountPreviewSchema.optional(),
});
export type RegistrationDraft = z.infer<typeof registrationDraftSchema>;

// POST /api/registrations/confirm response, and what GET returns once confirmed.
export const registrationConfirmationSchema = z.object({
  status: z.literal('confirmed'),
  confirmationId: z.string().uuid(),
  serviceDiscountPct: z.number(),
  productDiscountPct: z.number(),
  servicesTotal: z.number(),
  productsTotal: z.number(),
  grandTotal: z.number(),
});
export type RegistrationConfirmation = z.infer<typeof registrationConfirmationSchema>;

export const registrationResponseSchema = z.union([
  registrationDraftSchema,
  registrationConfirmationSchema,
]);
export type RegistrationResponse = z.infer<typeof registrationResponseSchema>;
