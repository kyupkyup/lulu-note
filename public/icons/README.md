# Extension Icons

This folder should contain the following icon files:

- `icon16.png` - 16x16 pixels (toolbar icon)
- `icon48.png` - 48x48 pixels (extension management page)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## Quick Way to Create Icons

### Option 1: Use an online generator
- Visit https://www.favicon-generator.org/
- Upload a logo or image
- Download all sizes

### Option 2: Create programmatically

You can use this Node.js script to generate placeholder icons:

```javascript
// generate-icons.js
const fs = require('fs');
const { createCanvas } = require('canvas');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(0, 0, size, size);

  // Border
  ctx.strokeStyle = '#2E7D32';
  ctx.lineWidth = size / 16;
  ctx.strokeRect(0, 0, size, size);

  // Text (P for Poker)
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

// Generate all sizes
[16, 48, 128].forEach(size => {
  const buffer = generateIcon(size);
  fs.writeFileSync(`icon${size}.png`, buffer);
  console.log(`Generated icon${size}.png`);
});
```

To use:
```bash
npm install canvas
node generate-icons.js
```

### Option 3: Use existing poker icons
- Search for free poker icons on:
  - https://www.flaticon.com/
  - https://www.iconfinder.com/
  - https://iconmonstr.com/

## For now (Development)

The extension will work without icons, but Chrome will show a default placeholder.
To quickly test, you can skip this step.

For production deployment to Chrome Web Store, icons are **required**.
