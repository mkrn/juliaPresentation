/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serve the presentation deck (a self-contained static HTML file in /public)
  // at the site root, while keeping the clean "/" URL.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/presentation.html' },
      ],
    };
  },
};

module.exports = nextConfig;
