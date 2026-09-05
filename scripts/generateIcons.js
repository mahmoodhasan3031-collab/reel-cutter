'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// 256x256 SVG of Reel Cutter Icon
const svg = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="52" fill="url(#bg)"/>
  <circle cx="128" cy="128" r="68" fill="none" stroke="#ffffff" stroke-width="14"/>
  <circle cx="128" cy="128" r="22" fill="#ffffff"/>
  <circle cx="128" cy="84" r="10" fill="#ffffff"/>
  <circle cx="128" cy="172" r="10" fill="#ffffff"/>
  <circle cx="84" cy="128" r="10" fill="#ffffff"/>
  <circle cx="172" cy="128" r="10" fill="#ffffff"/>
</svg>
`;

async function main() {
  const pngPath = path.join(buildDir, 'icon.png');
  await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(pngPath);
  console.log('✓ Created build/icon.png');

  // Electron Builder on Windows accepts .png or .ico for icon
  // For ICO, we can also generate a multi-size icon or copy PNG
  // Sharp can output PNG which electron-builder automatically converts to ICO if .ico is specified
  // Also create a license placeholder text file for NSIS installer
  const licensePath = path.join(buildDir, 'license.txt');
  const licenseText = `REEL CUTTER END USER LICENSE AGREEMENT

Copyright (c) 2026 Reel Cutter. All rights reserved.

1. GRANT OF LICENSE
Subject to the terms of this Agreement, Reel Cutter grants you a non-exclusive, non-transferable license to use the Software on devices bound to your verified hardware identification (HWID) according to your purchased license tier (Basic, Standard, or Pro).

2. RESTRICTIONS
You shall not:
(a) Modify, reverse engineer, decompile, or disassemble the Software.
(b) Share, lease, sublicense, or distribute your license key to unauthorized parties.
(c) Attempt to bypass hardware validation, feature gating, or licensing checks.

3. DISCLAIMER OF WARRANTIES
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.

4. TERMINATION
This license terminates automatically if you violate any of its terms or if your license is revoked.
`;
  fs.writeFileSync(licensePath, licenseText, 'utf8');
  console.log('✓ Created build/license.txt');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
