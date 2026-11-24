import Foundation
import Vision
import AppKit

var args = Array(CommandLine.arguments.dropFirst())
var output = ""
if args.first == "--out", args.count >= 2 {
    output = args[1]
    args.removeFirst(2)
}
let files = args
var allText = ""
for file in files {
    guard let image = NSImage(contentsOfFile: file),
          let data = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: data),
          let cgImage = rep.cgImage else { continue }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["zh-Hant", "en-US"]
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try? handler.perform([request])
    allText += "\n===== \(URL(fileURLWithPath: file).lastPathComponent) =====\n"
    for observation in (request.results ?? []).sorted(by: { $0.boundingBox.maxY > $1.boundingBox.maxY }) {
        if let text = observation.topCandidates(1).first?.string { allText += text + "\n" }
    }
}
if output.isEmpty { print(allText) } else { try? allText.write(toFile: output, atomically: true, encoding: .utf8) }
