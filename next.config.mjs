/** @type {import('next').NextConfig} */

import setupPWA from 'next-pwa';

const nextConfig = {
  reactStrictMode: true,
  output: 'export', // 启用静态导出
  trailingSlash: true, // 为静态导出添加尾部斜杠
  images: {
    unoptimized: true, // 静态导出时禁用图片优化
  },
  i18n: {
    locales: ['en', 'zh', 'zh-tw', 'de', 'ru', 'ja', 'fr', 'ko'],
    defaultLocale: 'zh',
  },
};

const withPWA = setupPWA({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
    register: true,
    skipWaiting: true,
    buildExcludes: [/manifest\.json$/, /_next\/data/, /_next\/static/],
    runtimeCaching: [
      // cache *.css, *.js, *.woff2 files
      {
        urlPattern: /^https?.*\.(css|js|woff2)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'assets-cache',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        }
      },
    ],
});

export default withPWA(nextConfig);
