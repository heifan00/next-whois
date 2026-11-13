/** @type {import('next').NextConfig} */

import setupPWA from "next-pwa";
import { execFileSync } from "node:child_process";

function getAppVersion() {
  const configured = process.env.APP_VERSION;
  if (configured && /^[a-f\d]{7,40}$/i.test(configured))
    return configured.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "development";
  }
}

const nextConfig = {
  env: { APP_VERSION: getAppVersion() },
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
