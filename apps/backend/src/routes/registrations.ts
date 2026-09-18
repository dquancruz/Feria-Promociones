import { calculateDiscounts, registrationDraftUpdateSchema } from '@feria/shared';
import { Router } from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../middleware/async-handler.js';
import * as registrations from '../services/registrations.js';

export function createRegistrationsRouter(pool: Pool): Router {
  const router = Router();

  router.get(
    '/draft',
    asyncHandler(async (req, res) => {
      const registration = await registrations.getOrCreateDraft(pool, req.sessionID);
      if (registration.status === 'confirmed') {
        res.json(await registrations.buildConfirmationResponse(pool, registration));
        return;
      }
      const items = await registrations.getSelectedItems(pool, registration.id);
      res.json(registrations.toDraftResponse(registration, items.map((item) => item.id)));
    }),
  );

  router.patch(
    '/draft',
    asyncHandler(async (req, res) => {
      const patch = registrationDraftUpdateSchema.parse(req.body);
      const registration = await registrations.getOrCreateDraft(pool, req.sessionID);
      if (registration.status === 'confirmed') {
        res.json(await registrations.buildConfirmationResponse(pool, registration));
        return;
      }

      const updated = await registrations.updateDraft(pool, registration.id, patch);
      if (updated.status === 'confirmed') {
        res.json(await registrations.buildConfirmationResponse(pool, updated));
        return;
      }
      const items = await registrations.getSelectedItems(pool, updated.id);
      const preview = calculateDiscounts({
        selectedServices: items.filter((item) => item.type === 'service'),
        selectedProducts: items.filter((item) => item.type === 'product'),
      });

      res.json({
        ...registrations.toDraftResponse(updated, items.map((item) => item.id)),
        discountPreview: {
          serviceDiscountPct: preview.serviceDiscountPct,
          productDiscountPct: preview.productDiscountPct,
        },
      });
    }),
  );

  router.post(
    '/confirm',
    asyncHandler(async (req, res) => {
      const registration = await registrations.getOrCreateDraft(pool, req.sessionID);
      const { registration: result, alreadyConfirmed } = await registrations.confirmDraft(pool, registration.id);
      const body = await registrations.buildConfirmationResponse(pool, result);
      res.status(alreadyConfirmed ? 409 : 200).json(body);
    }),
  );

  router.post(
    '/session/reset',
    asyncHandler(async (req, res) => {
      // Only clears the session so a new draft can start from the same browser.
      // The confirmed registration row is business data and stays in the database.
      await new Promise<void>((resolve, reject) => {
        req.session.destroy((err) => (err ? reject(err) : resolve()));
      });
      res.clearCookie('sid');
      res.status(204).end();
    }),
  );

  return router;
}
