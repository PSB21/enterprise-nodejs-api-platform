import { parseEnv } from '../src/config/env';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  MONGODB_URI: 'mongodb://localhost:27017/ams',
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
      REFRESH_TOKEN_TTL_DAYS: 7,
      UPSTREAM_ALLOWED_HOSTS: ['localhost', '127.0.0.1'],
    });
  });

  it('converts PORT to a number and splits CORS_ORIGINS', () => {
    const env = parseEnv({ ...base, PORT: '8080', CORS_ORIGINS: 'http://a.test, http://b.test,' });

    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('requires the database URLs and JWT_SECRET', () => {
    expect(errorMessage({})).toBe(
      'Invalid environment variables: DATABASE_URL, MONGODB_URI, JWT_SECRET'
    );
  });

  it.each([
    ['DATABASE_URL', 'mysql://user:pass@localhost/db'],
    ['MONGODB_URI', 'postgresql://user:pass@localhost/db'],
    ['JWT_SECRET', 'too-short'],
  ])('rejects an invalid %s', (name, value) => {
    expect(errorMessage({ ...base, [name]: value })).toBe(`Invalid environment variables: ${name}`);
  });

  it('names the invalid variable without showing its value', () => {
    expect(errorMessage({ ...base, PORT: 'not-a-port-secret' })).toBe(
      'Invalid environment variables: PORT'
    );
  });
});
