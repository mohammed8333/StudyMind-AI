/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  webpack: (config, { dev }) => {
    // Disable Webpack disk pack caching to avoid Windows V8 ArrayBuffer allocation limit errors
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
