# Homebrew cask 模板 — 发布到 tap 仓库（如 nazha/homebrew-skim）后生效。
# 发布流程：tauri build 出 dmg → GitHub Release 上传 → 填 version/sha256 → push tap。
cask "skim-skills" do
  version "0.1.0"
  sha256 "REPLACE_WITH_DMG_SHA256"

  url "https://github.com/REPLACE_OWNER/skim/releases/download/v#{version}/Skim_#{version}_aarch64.dmg"
  name "Skim"
  desc "Skills manager for Claude Code & Codex"
  homepage "https://github.com/REPLACE_OWNER/skim"

  depends_on macos: ">= :ventura"

  app "Skim.app"

  # 未签名应用：cask 安装会自动剥离 quarantine，免去用户右键打开
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Skim.app"],
                   sudo: false
  end

  zap trash: [
    "~/.skim",
  ]
end
