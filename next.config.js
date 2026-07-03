/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }] },
  experimental: {
    serverActions: { bodySizeLimit: '15mb' },
  },
};

module.exports = nextConfig;
