import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@rivallens/db', '@rivallens/domain', '@rivallens/schemas'],
};

export default nextConfig;
