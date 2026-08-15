function appVersion(): string | null {
  const raw = process.env['AMAZON_APP_VERSION'];
  if (raw === undefined) return 'beta';
  return raw || null;
}

delete process.env['AMAZON_APP_VERSION'];
console.log('unset ->', appVersion(), '(expected: beta)');

process.env['AMAZON_APP_VERSION'] = '';
console.log('empty string ->', appVersion(), '(expected: null)');

process.env['AMAZON_APP_VERSION'] = 'beta';
console.log('explicit beta ->', appVersion(), '(expected: beta)');
