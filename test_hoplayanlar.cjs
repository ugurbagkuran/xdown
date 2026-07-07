const fs = require('fs');
const body = fs.readFileSync('hoplayanlar.html', 'utf-8');
const nonce = body.match(/nonce:\s*'([a-f0-9]+)'/);
const postId = body.match(/data-part=\"(\d+)\"/);
const changeSource = body.match(/Change_Source\('(\d+)','([^']+)'\)/g);
console.log('nonce:', nonce?.[1]);
console.log('postId:', postId?.[1]);
console.log('changeSource:', changeSource?.slice(0,5));

if (!postId && changeSource) {
  const m = changeSource[0].match(/Change_Source\('(\d+)','([^']+)'\)/);
  if (m) console.log('Extracted postId from Change_Source:', m[1]);
}

const altPostId = body.match(/postid[:=]\s*['"]?(\d+)['"]?/i) || body.match(/id=\"post-(\d+)\"/i);
console.log('altPostId:', altPostId?.[1]);
