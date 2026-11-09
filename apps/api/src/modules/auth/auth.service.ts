import { prisma } from '../../db/prisma';
import { AppError } from '../../errors/app-error';
import { Prisma } from '../../generated/prisma/client';
import { toPublicUser } from '../users/user.dto';
import type { LoginInput, RegisterInput } from './auth.schemas';
import { hashPassword, verifyPasswordOrDummy } from './password';

export async function register(input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);

  try {
    // Everyone signs up as a DEVELOPER. Only an admin can grant another role, so a request
    // body can never make someone an admin.
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
    return toPublicUser(user);
  } catch (err) {
    // Relying on the unique index, rather than checking first, also covers two sign-ups at once.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw err;
  }
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = await verifyPasswordOrDummy(input.password, user?.passwordHash);

  if (!user || !valid) {
    // One message for both cases, so the response does not reveal which emails exist.
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  return user;
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    throw new AppError(401, 'INVALID_TOKEN', 'The account for this token no longer exists');
  }

  return user;
}
