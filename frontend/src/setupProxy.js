const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api', // Proxy tất cả request bắt đầu bằng /api đến BE
    createProxyMiddleware({
      target: 'http://localhost:5000', // URL BE
      changeOrigin: true, // Thay đổi origin header
    })
  );
  app.use(
    '/uploads', // Nếu có upload file (ProShop thường có)
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
    })
  );
};
