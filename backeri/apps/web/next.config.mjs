/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@backeri/shared'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
