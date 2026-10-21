/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  experimental: {
    // Needed because the app has several root layouts (public vs. secure areas).
    globalNotFound: true
  }
};

export default nextConfig;
