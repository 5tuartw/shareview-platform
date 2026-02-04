import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // Enable experimental features if needed for NextAuth.js v5
  },
};

export default nextConfig;
