// Detects the REAL image type from the first bytes, so a renamed text/exe file cannot pass as a photo
function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

// Returns an error message, or null when every file is a genuine image (and normalises the mime type)
function validateImages(files) {
  for (const f of files) {
    const real = detectImageType(f.buffer);
    if (!real) return `"${String(f.originalname || 'file').slice(0, 60)}" is not a valid JPEG, PNG or WebP image.`;
    f.mimetype = real;
  }
  return null;
}

module.exports = { detectImageType, validateImages };
