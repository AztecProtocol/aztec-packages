import SwiftUI

struct ContentView: View {
    private let status = MobileBenchBridge.status()
    private let abiVersion = MobileBenchBridge.abiVersion()

    var body: some View {
        VStack(spacing: 12) {
            Text("Barretenberg Mobile Bench")
                .font(.title2)
                .fontWeight(.semibold)
            Text("\(status) (ABI \(abiVersion))")
                .font(.body)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
