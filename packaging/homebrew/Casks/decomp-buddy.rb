# Created by scripts/packages.mjs
cask "decomp-buddy" do
  arch arm: "arm64", intel: "x64"

  version "0.30.7"
  sha256 arm:   "4fc4df319fa315f51fd5e493e4fbfec8d1e8d386ffa0aa1b8e98dcbde79bc2dc",
         intel: "768b85e32a14750932f9ba64f04e83805c854e8b88d3948cbc66dbd6d0c4fc18"

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
