import { Router } from 'express';
import { updateProductSchema } from '@backeri/shared';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { catalogService } from './catalog.service';

const router = Router();

router.get(
  '/menu',
  asyncHandler(async (_req, res) => {
    const menu = await catalogService.getMenu();
    res.status(200).json(menu);
  })
);

router.get(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const product = await catalogService.getProductByIdOrSlug(req.params.id);
    res.status(200).json({ product });
  })
);

router.get(
  '/admin/products',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (_req, res) => {
    const menu = await catalogService.getMenu({ includeInactive: true });
    res.status(200).json(menu);
  })
);

router.patch(
  '/admin/products/:id',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = updateProductSchema.parse(req.body);
    const product = await catalogService.updateProduct(
      req.params.id,
      parsed,
      req.user!.role
    );
    res.status(200).json({ product });
  })
);

export const catalogRoutes = router;
