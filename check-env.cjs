require('dotenv').config({ path: '.env.local' });

console.log('PROJECT', !!process.env.FIREBASE_ADMIN_PROJECT_ID);
console.log('EMAIL', !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
console.log('KEY', !!process.env.FIREBASE_ADMIN_PRIVATE_KEY);
