# Created by scripts/packages.mjs
cask "decomp-buddy" do
  arch arm: "arm64", intel: "x64"

  version "0.31.0"
  sha256 arm:   "33fb15dc02511d8f1a1df7d63ed1a8819ec5057275486db9d58587046ecd5e1a",
         intel: "2dc347f7f68b44cd145a7e61e6d3aa5a63e763294599029969d2bc648c3d24d7"

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
