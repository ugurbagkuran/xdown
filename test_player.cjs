const https = require('https');
const url = 'https://www.fullhdfilmizle.mom/hoplayanlar-izle-7/';
const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    const nonce = body.match(/nonce:\s*'([a-f0-9]+)'/);
    const postId = body.match(/data-part=\"(\d+)\"/);
    console.log('nonce:', nonce?.[1]);
    console.log('postId:', postId?.[1]);
    if (!nonce || !postId) {
      console.log('First 500 chars:', body.slice(0, 500));
    }
  });
});
