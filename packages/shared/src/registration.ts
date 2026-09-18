import { z } from 'zod';

export const registrationStatusSchema = z.enum(['draft', 'confirmed']);
export type RegistrationStatus = z.infer<typeof registrationStatusSchema>;

export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;

// PATCH /api/registrations/draft request body: any subset of the draft fields.
// Drafts are autosaved while the person is still typing, so this only bounds
// shape and length. Email format is checked when the registration is confirmed.
export const registrationDraftUpdateSchema = z.object({
  nombre: z
    .string({ invalid_type_error: 'Nombre inválido' })
    .max(NAME_MAX_LENGTH, `El nombre no puede superar ${NAME_MAX_LENGTH} caracteres`)
    .optional(),
  apellidos: z
    .string({ invalid_type_error: 'Apellidos inválidos' })
    .max(NAME_MAX_LENGTH, `Los apellidos no pueden superar ${NAME_MAX_LENGTH} caracteres`)
    .optional(),
  email: z
    .string({ invalid_type_error: 'Email inválido' })
    .trim()
    .max(EMAIL_MAX_LENGTH, `El email no puede superar ${EMAIL_MAX_LENGTH} caracteres`)
    .optional(),
  attendAt: z
    .string({ invalid_type_error: 'Fecha y hora inválidas' })
    .datetime({ message: 'Fecha y hora inválidas' })
    .nullable()
    .optional(),
  selectedItemIds: z
    .array(z.string({ invalid_type_error: 'Selección inválida' }).uuid('Selección inválida'), {
      invalid_type_error: 'Selección inválida',
    })
    .optional(),
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
