import bcrypt from 'bcryptjs';

// Each +1 doubles the work. 12 takes a fraction of a second to check, which is fine for one
// login but makes guessing millions of passwords from a stolen hash very slow.
const COST = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// Compared against when the email does not exist, so a login takes the same time either way.
// Otherwise a fast "no such user" reply would reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

export async function verifyPasswordOrDummy(password: string, hash: string | undefined) {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== undefined && matches;
}
