import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { getAuthClientIp } from './auth-client-ip.js';

const renderEnvironment = {
  AUTH_CLIENT_IP_SOURCE: 'render-cloudflare',
  RENDER: 'true',
  RENDER_SERVICE_TYPE: 'web',
};

describe('Auth client-IP selection', () => {
  it('uses the socket by default even when forwarding headers are present', () => {
    expect(
      getAuthClientIp(
        {
          socket: { remoteAddress: '127.0.0.1' },
          headers: {
            'cf-connecting-ip': '198.51.100.1',
            'x-forwarded-for': '203.0.113.1',
          },
        },
        {},
      ),
    ).toBe('127.0.0.1');
  });

  it.each(['198.51.100.1', '2001:db8::1'])(
    'accepts a single edge-provided IP: %s',
    (ip) => {
      expect(
        getAuthClientIp(
          {
            socket: { remoteAddress: '10.0.0.1' },
            headers: {
              'cf-connecting-ip': ip,
              'x-forwarded-for': '203.0.113.1',
            },
          },
          renderEnvironment,
        ),
      ).toBe(ip);
    },
  );

  it.each([
    undefined,
    '',
    'not-an-ip',
    '198.51.100.1, 203.0.113.1',
    ' 198.51.100.1',
    '198.51.100.1:1234',
    ['198.51.100.1', '203.0.113.1'],
  ])(
    'rejects missing, malformed, or multiple trusted header values: %s',
    (ip) => {
      expect(() =>
        getAuthClientIp(
          {
            socket: { remoteAddress: '10.0.0.1' },
            headers: { 'cf-connecting-ip': ip },
          },
          renderEnvironment,
        ),
      ).toThrow(ServiceUnavailableException);
    },
  );

  it.each([
    { ...renderEnvironment, RENDER: undefined },
    { ...renderEnvironment, RENDER: 'false' },
    { ...renderEnvironment, RENDER_SERVICE_TYPE: 'pserv' },
    { AUTH_CLIENT_IP_SOURCE: 'unknown' },
  ])('fails closed outside the configured deployment contract', (env) => {
    expect(() =>
      getAuthClientIp(
        {
          socket: { remoteAddress: '127.0.0.1' },
          headers: { 'cf-connecting-ip': '198.51.100.1' },
        },
        env,
      ),
    ).toThrow(ServiceUnavailableException);
  });

  it('rejects a missing socket address in local mode', () => {
    expect(() => getAuthClientIp({ socket: {}, headers: {} }, {})).toThrow(
      ServiceUnavailableException,
    );
  });
});
