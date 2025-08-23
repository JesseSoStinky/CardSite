/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true, // ensures App Router is enabled
  },
};

module.exports = nextConfig;

