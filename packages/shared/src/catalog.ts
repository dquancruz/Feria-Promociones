import { z } from 'zod';

export const catalogItemTypeSchema = z.enum(['service', 'product']);
export type CatalogItemType = z.infer<typeof catalogItemTypeSchema>;

export const catalogItemSchema = z.object({
  id: z.string().uuid(),
  type: catalogItemTypeSchema,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  priceCents: z.number().int().nonnegative(),
  active: z.boolean(),
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;
