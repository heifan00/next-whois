/** @type {import('next').NextConfig} */

import setupPWA from "next-pwa";

const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
  },
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "zh",
  },
};

const withPWA = setupPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  buildExcludes: [/manifest\.json$/, /_next\/data/, /_next\/static/],
  runtimeCaching: [
    {
      urlPattern: /^https?.*\.(css|js|woff2)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "assets-cache",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
      },
    },
  ],
});

export default withPWA(nextConfig);
