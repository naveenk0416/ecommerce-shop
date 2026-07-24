const http = require('http');
http.get('http://localhost:4000/', (res) => {
  console.log('Status:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Body length:', data.length);
    console.log(data.slice(0, 200));
    process.exit(0);
  });
}).on('error', (err) => { console.error('err', err); process.exit(1); });
