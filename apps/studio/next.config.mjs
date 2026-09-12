/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@brew-cms/core',
    '@brew-cms/content',
    '@brew-cms/policy',
    '@brew-cms/events',
    '@brew-cms/db',
    '@brew-cms/auth',
    '@brew-cms/media',
    '@brew-cms/search',
    '@brew-cms/api',
    '@brew-cms/mcp',
    '@brew-cms/ui',
  ],
};

export default nextConfig;
