import { parseEnv } from '../src/config/env';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

function errorMessage(source: NodeJS.ProcessEnv) {
  try {
    parseEnv(source);
    return '';
  } catch (err) {
    return (err as Error).message;
  }
}

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv(base)).toEqual({
      ...base,
      NODE_ENV: 'development',
      PORT: 5000,
      CORS_ORIGINS: ['http://localhost:3000'],
      ACCESS_TOKEN_TTL_SECONDS: 900,
    });
  });

  it('converts PORT to a number and splits CORS_ORIGINS', () => {
    const env = parseEnv({ ...base, PORT: '8080', CORS_ORIGINS: 'http://a.test, http://b.test,' });

    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('requires DATABASE_URL and JWT_SECRET', () => {
    expect(errorMessage({})).toBe('Invalid environment variables: DATABASE_URL, JWT_SECRET');
  });

  it('rejects a DATABASE_URL that is not Postgres', () => {
    expect(errorMessage({ ...base, DATABASE_URL: 'mysql://user:pass@localhost/db' })).toBe(
      'Invalid environment variables: DATABASE_URL'
    );
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(errorMessage({ ...base, JWT_SECRET: 'too-short' })).toBe(
      'Invalid environment variables: JWT_SECRET'
    );
  });

  it('names the invalid variable without showing its value', () => {
    expect(errorMessage({ ...base, PORT: 'not-a-port-secret' })).toBe(
      'Invalid environment variables: PORT'
    );
  });
});
