# Created by scripts/packages.mjs
cask "decomp-buddy" do
  arch arm: "arm64", intel: "x64"

  version "0.32.1"
  sha256 arm:   "92d9293e2950b85302888653a8681ceb92a978d899f1e4edf4f158dde9cb0c2a",
         intel: "541b3ae7143ed86e37ace913a9af0e65bc04bc41ee877e513948b5ee5868ef17"

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
