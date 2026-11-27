import { Router } from 'express';
import {
  createProductSchema,
  createVariantSchema,
  updateProductSchema,
  updateVariantSchema,
} from '@backeri/shared';
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
    const product = await catalogService.getProductByIdOrSlug(String(req.params.id));
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

router.post(
  '/admin/products',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = createProductSchema.parse(req.body);
    const product = await catalogService.createProduct(parsed);
    res.status(201).json({ product });
  })
);

router.patch(
  '/admin/products/:id',
  authenticate,
  requireRole('BAKER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = updateProductSchema.parse(req.body);
    const product = await catalogService.updateProduct(
      String(req.params.id),
      parsed,
      req.user!.role
    );
    res.status(200).json({ product });
  })
);

router.delete(
  '/admin/products/:id',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await catalogService.deleteOrArchiveProduct(String(req.params.id));
    res.status(200).json(result);
  })
);

router.post(
  '/admin/products/:id/variants',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = createVariantSchema.parse(req.body);
    const variant = await catalogService.addVariant(String(req.params.id), parsed);
    res.status(201).json({ variant });
  })
);

router.patch(
  '/admin/products/:id/variants/:variantId',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = updateVariantSchema.parse(req.body);
    const variant = await catalogService.updateVariant(
      String(req.params.id),
      String(req.params.variantId),
      parsed
    );
    res.status(200).json({ variant });
  })
);

router.delete(
  '/admin/products/:id/variants/:variantId',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const result = await catalogService.deleteOrArchiveVariant(
      String(req.params.id),
      String(req.params.variantId)
    );
    res.status(200).json(result);
  })
);

export const catalogRoutes = router;
