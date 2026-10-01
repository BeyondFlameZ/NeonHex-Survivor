#!/usr/bin/env bash
# Готовит Android-проект из веб-сборки (dist): создаёт, синхронизирует, ставит иконки, версию и полноэкранный режим
set -euo pipefail
APP_ID=com.beyondflamez.neonhex
[ -d android ] || npx cap add android
npx cap sync android
npx @capacitor/assets generate --android \
  --iconBackgroundColor '#07050a' --iconBackgroundColorDark '#07050a' \
  --splashBackgroundColor '#07050a' --splashBackgroundColorDark '#07050a'

VERSION_NAME=$(node -p "require('./package.json').version")
GRADLE=android/app/build.gradle
sed -i -E "s/versionCode( =)? [0-9]+/versionCode\1 ${VERSION_CODE:-1}/; s/versionName( =)? \"[^\"]*\"/versionName\1 \"${VERSION_NAME}\"/" "$GRADLE"
grep -nE "versionCode|versionName|targetSdk" "$GRADLE" android/variables.gradle || true

PKG_DIR="android/app/src/main/java/$(echo "$APP_ID" | tr . /)"
mkdir -p "$PKG_DIR"
rm -f "$PKG_DIR"/MainActivity.*
cp native/android/MainActivity.java "$PKG_DIR/MainActivity.java"
