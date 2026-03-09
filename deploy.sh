#!/bin/bash

# rkgk Gallery 一鍵同步打包腳本
# 自動掃描根目錄圖集文件夾，與 site.json / 前端底部按鈕對齊

set -e

SITE_DIR="$(pwd)"
SITE_JSON="$SITE_DIR/site.json"
ZIP_FILE="$SITE_DIR/rkgk_gallery.zip"
DEPLOY_PACKS="$SITE_DIR/.deploy_packs"

echo "🌿 rkgk Gallery 語場同步開始..."

# 1. 自動發現根目錄圖集、更新 manifests/order.txt、對齊 site.json（前端底部按鈕與此一致）
node -e "
const fs = require('fs');
const path = require('path');
const siteDir = process.argv[1] || process.cwd();
const supportedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const skipDirs = new Set(['packs', 'docs', 'node_modules', '.git']);
const rootPackIds = fs.readdirSync(siteDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('.') && !skipDirs.has(d.name))
  .map(d => d.name)
  .filter(packId => {
    try {
      const imgDir = path.join(siteDir, packId);
      const files = fs.readdirSync(imgDir, { withFileTypes: true }).filter(f => f.isFile());
      return files.some(f => supportedExt.includes(path.extname(f.name).toLowerCase()));
    } catch (e) { return false; }
  })
  .sort();
const discoveredIds = [];
rootPackIds.forEach(packId => {
  const imgDir = path.join(siteDir, packId);
  const outDir = path.join(siteDir, 'packs', packId);
  const imageFilesSet = new Set(fs.readdirSync(imgDir).filter(file => supportedExt.includes(path.extname(file).toLowerCase())));
  if (imageFilesSet.size === 0) return;
  fs.mkdirSync(outDir, { recursive: true });
  const orderPath = path.join(outDir, 'order.txt');
  let order;
  if (fs.existsSync(orderPath)) {
    const existingLines = fs.readFileSync(orderPath, 'utf8').split('\n').map(l => l.trim()).filter(l => l);
    order = existingLines.filter(f => imageFilesSet.has(f));
    const inOrder = new Set(order);
    const newFiles = [...imageFilesSet].filter(f => !inOrder.has(f)).sort();
    order = order.concat(newFiles);
  } else {
    const withDate = [], noDate = [];
    [...imageFilesSet].forEach(f => {
      const m = f.match(/^(\d{8})/);
      if (m) withDate.push({ d: m[1], f }); else noDate.push(f);
    });
    withDate.sort((a, b) => b.d.localeCompare(a.d));
    order = withDate.map(x => x.f).concat(noDate.sort());
  }
  fs.writeFileSync(orderPath, order.join('\n') + '\n');
  const manifestPath = path.join(outDir, 'manifest.json');
  let manifest = { packId, label: packId, sets: {}, items: [] };
  const existingByFile = new Map();
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.items) manifest.items.forEach(item => { existingByFile.set(item.file.split('/').pop(), item); });
  }
  const items = order.map(file => {
    const existing = existingByFile.get(file);
    return existing ? { file, title: existing.title ?? null, tags: existing.tags || [], set: existing.set ?? null } : { file, title: null, tags: [], set: null };
  });
  manifest.packId = packId; manifest.label = manifest.label || packId; manifest.sets = manifest.sets || {}; manifest.items = items;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  discoveredIds.push(packId);
  console.log('📝 ' + packId + ': ' + items.length + ' 張');
});
const siteJsonPath = path.join(siteDir, 'site.json');
let siteData = { defaultPack: null, packs: [] };
if (fs.existsSync(siteJsonPath)) siteData = JSON.parse(fs.readFileSync(siteJsonPath, 'utf8'));
const existingById = new Map((siteData.packs || []).map(p => [p.id, p]));
const packs = discoveredIds.map((id, i) => { const p = existingById.get(id) || { id, label: id, priority: 100 - i * 20 }; return { id, label: p.label || id, priority: p.priority }; }).sort((a, b) => b.priority - a.priority);
siteData.packs = packs;
siteData.defaultPack = packs.some(p => p.id === siteData.defaultPack) ? siteData.defaultPack : (packs[0] ? packs[0].id : null);
fs.writeFileSync(siteJsonPath, JSON.stringify(siteData, null, 2));
fs.writeFileSync(path.join(siteDir, '.deploy_packs'), discoveredIds.join('\n'));
console.log('📝 site.json 已對齊（' + packs.length + ' 個圖集）');
" "$SITE_DIR"

ROOT_PACKS=$(cat "$DEPLOY_PACKS" 2>/dev/null | tr '\n' ' ')
[ -z "$ROOT_PACKS" ] && ROOT_PACKS="2024-2025 2022-2023 eden"

# 2. 打包 zip
echo "📦 建立壓縮檔案..."
rm -f "$ZIP_FILE"
zip -r "$ZIP_FILE" index.html site.json packs $ROOT_PACKS -x "*.DS_Store" > /dev/null 2>&1 || true

# 3. Git
echo "🔄 Git 狀態更新..."
git add .
git commit -m "🌀 Update rkgk gallery" || echo "⚠️  No changes to commit"
git push -u origin main || echo "⚠️  Push failed or no remote"

echo "✅ rkgk Gallery 已同步封裝！"
echo "📁 壓縮包：$ZIP_FILE"
read -n 1 -s -r -p "按任意鍵退出..."
