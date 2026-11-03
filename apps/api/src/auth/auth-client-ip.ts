import { ServiceUnavailableException } from '@nestjs/common';
import { isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

interface ClientIpRequest {
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string };
}

export function getAuthClientIp(
  request: ClientIpRequest,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const source = env.AUTH_CLIENT_IP_SOURCE ?? 'socket';
  let ip: string | string[] | undefined;

  if (source === 'render-cloudflare') {
    // This is an explicit contract for Render's public web-service edge,
    // which overwrites CF-Connecting-IP. Never use arbitrary XFF chains.
    if (env.RENDER !== 'true' || env.RENDER_SERVICE_TYPE !== 'web') {
      throw new ServiceUnavailableException(
        'Authentication temporarily unavailable',
      );
    }
    ip = request.headers['cf-connecting-ip'];
  } else if (source === 'socket') {
    // Ignore forwarded headers and Express's potentially proxy-derived req.ip.
    ip = request.socket.remoteAddress;
  }

  if (typeof ip !== 'string' || isIP(ip) === 0) {
    // A missing/malformed trusted header must not bypass the limiter.
    throw new ServiceUnavailableException(
      'Authentication temporarily unavailable',
    );
  }
  return ip;
}
