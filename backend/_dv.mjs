import fs from 'node:fs'; import * as XLSX from 'xlsx';
const cfb = XLSX.CFB.read(fs.readFileSync(process.argv[2]), { type: 'buffer' });
const wbs = XLSX.CFB.find(cfb, 'Workbook') || XLSX.CFB.find(cfb, 'Book');
const b = Buffer.from(wbs.content);
let off = 0, sheet = -1;
const col = (n) => { let s=''; n++; while(n){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26;} return s; };
while (off + 4 <= b.length) {
  const type = b.readUInt16LE(off), len = b.readUInt16LE(off + 2), d = b.subarray(off + 4, off + 4 + len);
  if (type === 0x0809 && d.readUInt16LE(2) === 0x0010) sheet++;
  if (type === 0x01BE) {
    const opts = d.readUInt32LE(0); const vt = opts & 0xF; let p = 4;
    const str = () => { const n = d.readUInt16LE(p); const f = d[p+2]; p += 3; const s = f & 1 ? d.subarray(p, p+2*n).toString('utf16le') : d.subarray(p, p+n).toString('latin1'); p += f & 1 ? 2*n : n; return s; };
    str(); str(); str(); str();
    const f1len = d.readUInt16LE(p); p += 4; const f1 = d.subarray(p, p + f1len); p += f1len;
    const f2len = d.readUInt16LE(p); p += 4 + f2len;
    const nref = d.readUInt16LE(p); p += 2; const refs = [];
    for (let i = 0; i < nref; i++) { const r1=d.readUInt16LE(p), r2=d.readUInt16LE(p+2), c1=d.readUInt16LE(p+4), c2=d.readUInt16LE(p+6); p+=8; refs.push(`${col(c1)}${r1+1}:${col(c2)}${r2+1}`); }
    let formula = f1.toString('latin1').replace(/[^\x20-\x7e]/g, '·');
    if (f1[0] === 0x17) { const n=f1[1]; formula = 'LIST: ' + (f1[2]&1 ? f1.subarray(3,3+2*n).toString('utf16le') : f1.subarray(3,3+n).toString('latin1')).replace(/\0/g, ','); }
    if (vt === 3) console.log('sheet', sheet, refs.join(' '), formula.slice(0, 120));
  }
  off += 4 + len;
}
