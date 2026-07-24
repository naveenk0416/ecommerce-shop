(async () => {
  try {
    await import('@angular/compiler');
    const pkg = await import('@angular/ssr');
    console.log('package exports:', Object.keys(pkg).slice(0,200));
  } catch (err) {
    console.error('inspect error', err);
  }
})();
