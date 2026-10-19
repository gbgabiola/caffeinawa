import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

if (process.env.STATIC_EXPORT === 'true') {
  nextConfig.output = 'export';
  nextConfig.trailingSlash = true;
}

export default nextConfig;
