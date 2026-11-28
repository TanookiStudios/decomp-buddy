# Created by scripts/packages.mjs
cask "decomp-buddy" do
  arch arm: "arm64", intel: "x64"

  version "0.34.3"
  sha256 arm:   "c5a59a2dd7885534ef48b10ea4dc25a8864ad1c973d4389c4374566423cd1d7e",
         intel: "650e80103917136621402c6f13906f6390a267c17fd79ef6a7bac2203a340dc2"

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
