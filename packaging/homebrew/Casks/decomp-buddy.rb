# Created by scripts/packages.mjs
cask "decomp-buddy" do
  arch arm: "arm64", intel: "x64"

  version "0.31.1"
  sha256 arm:   "78be17fbd8b482a161a0ac8747146dc63e3ae7eda9da3832b882cc7f5e093da0",
         intel: "ad2946d06c1ac696f1338726f5491df6fcceb0e177da2e8022334c4962007684"

  url "https://github.com/TanookiStudios/decomp-buddy/releases/download/v#{version}/Decomp.Buddy-#{version}-#{arch}.dmg",
      verified: "github.com/TanookiStudios/decomp-buddy/"
  name "Decomp Buddy"
  desc "Installs and updates fan-made PC ports of classic games"
  homepage "https://decompbuddy.com/"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: :ventura

  app "Decomp Buddy.app"

  zap trash: [
    "~/Library/Application Support/Decomp Buddy",
    "~/Library/Preferences/com.tanookistudios.decompbuddy.plist",
    "~/Library/Saved Application State/com.tanookistudios.decompbuddy.savedState",
  ]
end
