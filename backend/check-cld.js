require('dotenv').config();
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

(async () => {
  try {
    const r = await cloudinary.api.transformations({ max_results: 100 });
    console.log('=== Total named transformations: ' + (r.transformations || []).length + ' ===');
    (r.transformations || []).slice(0, 20).forEach(t => console.log('-', t.name, 'used:' + (t.used_count || 0)));
  } catch (e) { console.log('err 1:', e.message); }

  try {
    const r = await cloudinary.api.root_folders();
    console.log('\n=== Root folders ===');
    console.log(JSON.stringify(r, null, 2));
  } catch (e) { console.log('err 2:', e.message); }
})();
