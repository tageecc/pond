import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/**
 * macOS 应用图标（与 Xcode / 设计资源常用网格一致，非「约等于」）：
 *
 * - 文档画布：1024×1024 px（单资源主图常用尺寸；见 Apple「Configuring your app icon」等文档）
 * - 圆角矩形主体：824×824 px，连续圆角半径 185.4 px，相对画布居中
 * - 四边透明边距：各 100 px（(1024−824)/2）
 *
 * 上述主体尺寸与圆角在 Apple Developer Forums 中由工程师/设计者多次引用，与
 * Apple Design Resources 中模板一致，例如：
 * https://developer.apple.com/forums/thread/670578
 * https://developer.apple.com/forums/thread/761179（Accepted Answer 同上）
 *
 * HIG 说明 macOS 需自行提供最终形状（系统不像 iOS 那样统一加 mask）：
 * https://developer.apple.com/design/human-interface-guidelines/app-icons
 *
 * 主体内插画/图形占多少像素：公开 HIG **未**给出单一数值；以下为在 824 主体内
 * 的等比缩放上限（留白），可按需要改 ART_MAX_IN_BODY。
 */
const MACOS_ICON_DOC = 1024;
const MACOS_ICON_BODY = 824;
const MACOS_ICON_RX = 185.4;
const MACOS_ICON_GUTTER = (MACOS_ICON_DOC - MACOS_ICON_BODY) / 2;
const ART_MAX_IN_BODY = 0.72;

const W = MACOS_ICON_DOC;
const H = MACOS_ICON_DOC;
const FUZZ = 36;

function distWhite(r, g, b) {
  return Math.hypot(r - 255, g - 255, b - 255);
}

function isBackgroundLike(r, g, b) {
  return distWhite(r, g, b) <= FUZZ;
}

function removeEdgeBackground(raw, width, height) {
  const out = new Uint8Array(raw);
  const marked = new Uint8Array(width * height);
  const queue = [];

  const idx = (x, y) => y * width + x;

  const tryPush = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = idx(x, y);
    if (marked[i]) return;
    const o = i * 4;
    if (!isBackgroundLike(out[o], out[o + 1], out[o + 2])) return;
    marked[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (queue.length) {
    const i = queue.pop();
    const x = i % width;
    const y = (i / width) | 0;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  for (let i = 0; i < width * height; i++) {
    if (marked[i]) out[i * 4 + 3] = 0;
  }
  return Buffer.from(out);
}

async function whitePlatePng() {
  const o = MACOS_ICON_GUTTER;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="${o}" y="${o}" width="${MACOS_ICON_BODY}" height="${MACOS_ICON_BODY}" rx="${MACOS_ICON_RX}" ry="${MACOS_ICON_RX}" fill="#ffffff"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const defaultSrc = path.join(root, 'src-tauri/icons/app-icon-source.png');
  const input = process.argv[2] ? path.resolve(process.argv[2]) : defaultSrc;

  if (!fs.existsSync(input)) {
    console.error('missing source png:', input);
    process.exit(1);
  }

  const meta = await sharp(input).metadata();
  if (meta.width !== W || meta.height !== H) {
    console.error('source must be', W, 'x', H, 'got', meta.width, meta.height);
    process.exit(1);
  }

  const rawBuf = await sharp(input).ensureAlpha().raw().toBuffer();
  const cleared = removeEdgeBackground(rawBuf, W, H);
  const trimmed = await sharp(cleared, {
    raw: { width: W, height: H, channels: 4 },
  })
    .png()
    .trim()
    .toBuffer();

  const innerMax = Math.round(MACOS_ICON_BODY * ART_MAX_IN_BODY);
  const scaled = await sharp(trimmed)
    .resize({
      width: innerMax,
      height: innerMax,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const sm = await sharp(scaled).metadata();
  const left = Math.round((W - sm.width) / 2);
  const top = Math.round((H - sm.height) / 2);

  const bg = await whitePlatePng();
  const finalBuf = await sharp(bg)
    .composite([{ input: scaled, left, top }])
    .png()
    .toBuffer();

  const outIcon = path.join(root, 'src-tauri/icons/logo-source.png');
  await fs.promises.writeFile(outIcon, finalBuf);
  console.log('wrote', outIcon);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
