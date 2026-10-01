#!/usr/bin/env bash
# Готовит iOS-проект из веб-сборки (dist): создаёт, синхронизирует, ставит иконки и настройки Info.plist
set -euo pipefail
[ -d ios ] || npx cap add ios
npx cap sync ios
npx @capacitor/assets generate --ios \
  --iconBackgroundColor '#07050a' --splashBackgroundColor '#07050a' --splashBackgroundColorDark '#07050a'

PL=ios/App/App/Info.plist
set_bool() {
  /usr/libexec/PlistBuddy -c "Delete :$1" "$PL" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :$1 bool $2" "$PL"
}
set_str() {
  /usr/libexec/PlistBuddy -c "Delete :$1" "$PL" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$PL"
}
# шифрование не используется — без лишней анкеты экспортного контроля
set_bool ITSAppUsesNonExemptEncryption false
# игра на весь экран, без статус-бара и без режима Split View на iPad
set_bool UIStatusBarHidden true
set_bool UIViewControllerBasedStatusBarAppearance false
set_bool UIRequiresFullScreen true
set_str LSApplicationCategoryType public.app-category.role-playing-games
/usr/libexec/PlistBuddy -c "Print" "$PL" | head -60
