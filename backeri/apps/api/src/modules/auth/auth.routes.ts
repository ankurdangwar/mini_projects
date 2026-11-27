import { Router } from 'express';
import {
  createStaffSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateStaffSchema,
  verifyEmailSchema,
} from '@backeri/shared';
import {
  AUTH_COOKIE_NAME,
  authenticate,
  requireRole,
  setAuthCookie,
} from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { authService } from './auth.service';

const router = Router();

router.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.parse(req.body);
    const result = await authService.register(parsed);
    setAuthCookie(res, result.token);
    res.status(201).json(result);
  })
);

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.parse(req.body);
    const { user, token } = await authService.login(parsed);
    setAuthCookie(res, token);
    res.status(200).json({ user, token });
  })
);

router.post('/auth/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
  res.status(200).json({ ok: true });
});

router.get(
  '/auth/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getProfile(req.user!.userId);
    res.status(200).json({ user });
  })
);

router.post(
  '/auth/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = verifyEmailSchema.parse(req.body);
    const result = await authService.verifyEmail(token);
    res.status(200).json(result);
  })
);

router.post(
  '/auth/resend-verification',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await authService.resendVerificationEmail(req.user!.userId);
    res.status(200).json(result);
  })
);

router.post(
  '/auth/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(email);
    res.status(200).json(result);
  })
);

router.post(
  '/auth/reset-password',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(token, newPassword);
    res.status(200).json(result);
  })
);

// --- Admin Staff Management ---
router.get(
  '/admin/staff',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const staff = await authService.listStaff();
    res.status(200).json({ staff });
  })
);

router.post(
  '/admin/staff',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = createStaffSchema.parse(req.body);
    const staff = await authService.createStaff(parsed);
    res.status(201).json({ staff });
  })
);

router.patch(
  '/admin/staff/:id',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = updateStaffSchema.parse(req.body);
    const staff = await authService.updateStaff(
      String(req.params.id),
      req.user!.userId,
      parsed
    );
    res.status(200).json({ staff });
  })
);

export const authRoutes = router;
