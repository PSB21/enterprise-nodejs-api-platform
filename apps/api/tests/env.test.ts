import { parseEnv } from '../src/config/env';

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 5000,
      CORS_ORIGINS: ['http://localhost:3000'],
    });
  });

  it('converts PORT to a number and splits CORS_ORIGINS', () => {
    const env = parseEnv({ PORT: '8080', CORS_ORIGINS: 'http://a.test, http://b.test,' });

    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('names the invalid variable without showing its value', () => {
    let message = '';

    try {
      parseEnv({ PORT: 'not-a-port-secret' });
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toBe('Invalid environment variables: PORT');
  });
});
