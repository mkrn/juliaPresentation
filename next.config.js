/** @type {import('next').NextConfig} */
const nextConfig = {
  // google-ads-api pulls in gRPC/protobuf — load it at runtime from node_modules
  // instead of bundling it into the serverless function.
  experimental: {
    serverComponentsExternalPackages: ['google-ads-api'],
  },
  // Serve the presentation deck (a self-contained static HTML file in /public)
  // at the site root, while keeping the clean "/" URL.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/presentation.html' },
        { source: '/demo', destination: '/presentation.html' },
      ],
    };
  },
};

module.exports = nextConfig;
