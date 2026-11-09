import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';
import { toPublicUser } from '../users/user.dto';
import { signAccessToken } from './access-token';
import { loginSchema, registerSchema } from './auth.schemas';
import * as authService from './auth.service';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await authService.register(input);

  res.status(201).json({ success: true, data: { user } });
});

authRouter.post('/login', async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await authService.login(input);

  res.json({
    success: true,
    data: { accessToken: signAccessToken(user), user: toPublicUser(user) },
  });
});

authRouter.get('/me', authenticate, async (req, res) => {
  // Read from the database rather than the token, so the reply reflects any recent changes.
  const user = await authService.getUserById(req.user!.id);

  res.json({ success: true, data: { user: toPublicUser(user) } });
});
