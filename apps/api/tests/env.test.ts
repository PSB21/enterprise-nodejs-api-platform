import { parseEnv } from '../src/config/env';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

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
    expect(parseEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 5000,
      CORS_ORIGINS: ['http://localhost:3000'],
      DATABASE_URL,
    });
  });

  it('converts PORT to a number and splits CORS_ORIGINS', () => {
    const env = parseEnv({
      DATABASE_URL,
      PORT: '8080',
      CORS_ORIGINS: 'http://a.test, http://b.test,',
    });

    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('requires DATABASE_URL', () => {
    expect(errorMessage({})).toBe('Invalid environment variables: DATABASE_URL');
  });

  it('rejects a DATABASE_URL that is not Postgres', () => {
    expect(errorMessage({ DATABASE_URL: 'mysql://user:pass@localhost/db' })).toBe(
      'Invalid environment variables: DATABASE_URL'
    );
  });

  it('names the invalid variable without showing its value', () => {
    expect(errorMessage({ DATABASE_URL, PORT: 'not-a-port-secret' })).toBe(
      'Invalid environment variables: PORT'
    );
  });
});
