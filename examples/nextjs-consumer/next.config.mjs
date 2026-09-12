/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@brew-cms/client', '@brew-cms/content', '@brew-cms/core'],
};

export default nextConfig;
