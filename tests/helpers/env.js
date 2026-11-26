// Import this FIRST in any test that loads code which reads src/config/env.js.
Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGO_URI: 'mongodb://127.0.0.1:27017/unused',
  CLIENT_ORIGIN: 'https://shop.example.com',
  BACHS_API_KEY: 'sk_sandbox_0123456789abcdef',
  BACHS_ENV: 'sandbox',
  BACHS_WEBHOOK_SECRET: 'whsec_0123456789',
  PUSH_ID_SECRET: '0123456789abcdef0123',
});
