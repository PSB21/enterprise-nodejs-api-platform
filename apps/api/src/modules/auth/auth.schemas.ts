import { z } from 'zod';

// Lowercased before validation, so the unique index treats A@x.com and a@x.com as one address.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

// bcrypt ignores everything after 72 bytes, so a longer password would silently be truncated.
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes');

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  // Only checked for presence: rules for new passwords must not lock out existing users.
  password: z.string().min(1).max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
