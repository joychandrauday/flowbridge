/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  transpilePackages: ['@flowbridge/core', '@flowbridge/db'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
      '@/components': path.resolve(__dirname, 'src/components'),
      '@/lib': path.resolve(__dirname, 'src/lib'),
      '@/hooks': path.resolve(__dirname, 'src/hooks'),
      '@/app': path.resolve(__dirname, 'src/app'),
      '@flowbridge/db': path.resolve(__dirname, '../../packages/db/src'),
      '@flowbridge/core': path.resolve(__dirname, '../../packages/core/src'),
    }
    return config
  },
}

module.exports = nextConfig