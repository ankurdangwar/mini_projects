import { Router } from 'express';
import { loginSchema, registerSchema } from '@backeri/shared';
import {
  AUTH_COOKIE_NAME,
  authenticate,
  setAuthCookie,
} from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { authService } from './auth.service';

const router = Router();

router.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.parse(req.body);
    const { user, token } = await authService.register(parsed);
    setAuthCookie(res, token);
    res.status(201).json({ user, token });
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

export const authRoutes = router;
