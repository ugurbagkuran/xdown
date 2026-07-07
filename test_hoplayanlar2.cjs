const fs = require('fs');
const body = fs.readFileSync('hoplayanlar.html', 'utf-8');
console.log('Title:', body.match(/<title>(.*?)<\/title>/)?.[1]);
const iframes = body.match(/<iframe[^>]*>/g);
console.log('iframes:', iframes);
const dataPostId = body.match(/data-post-id="(\d+)"/);
console.log('data-post-id:', dataPostId?.[1]);
const shortlink = body.match(/rel='shortlink' href='[^']+\?p=(\d+)'/);
console.log('shortlink id:', shortlink?.[1]);

const allIds = body.match(/postid[:=]\s*['"]?(\d+)['"]?/gi);
console.log('all postIds:', allIds);
