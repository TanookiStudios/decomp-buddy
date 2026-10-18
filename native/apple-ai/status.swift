import FoundationModels

// The one line `--status` prints, for any availability Apple's framework reports.
func statusLine(_ availability: SystemLanguageModel.Availability, contextSize: Int) -> String {
  if case .available = availability { return #"{"available":true,"contextSize":\#(contextSize)}"# }
  return #"{"available":false,"reason":"\#(String(describing: availability).replacingOccurrences(of: "\"", with: "'"))"}"#
}
