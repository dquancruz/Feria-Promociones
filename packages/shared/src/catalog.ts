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

const catalogNameSchema = z
  .string({ required_error: 'El nombre es requerido', invalid_type_error: 'Nombre inválido' })
  .trim()
  .min(1, 'El nombre es requerido')
  .max(120, 'El nombre es demasiado largo');

// Prices travel as whole cents so money never goes through floating point.
const catalogPriceSchema = z
  .number({ required_error: 'El precio es requerido', invalid_type_error: 'Precio inválido' })
  .int('El precio debe ser un número entero de centavos')
  .nonnegative('El precio no puede ser negativo')
  .max(100_000_000, 'El precio es demasiado alto');

// POST /api/admin/catalog
export const catalogItemInputSchema = z.object({
  type: catalogItemTypeSchema,
  name: catalogNameSchema,
  priceCents: catalogPriceSchema,
});
export type CatalogItemInput = z.infer<typeof catalogItemInputSchema>;

// PATCH /api/admin/catalog/:id: any subset of fields; `active` is how an item is retired or brought back.
export const catalogItemUpdateSchema = z
  .object({
    type: catalogItemTypeSchema,
    name: catalogNameSchema,
    priceCents: catalogPriceSchema,
    active: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios que guardar' });
export type CatalogItemUpdate = z.infer<typeof catalogItemUpdateSchema>;
