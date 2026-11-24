import SwiftUI

extension Color {
    static let graphiteBlack = Color(red: 13 / 255, green: 13 / 255, blue: 15 / 255)
    static let graphiteBackground = Color(red: 13 / 255, green: 13 / 255, blue: 15 / 255)
    static let graphiteSurface = Color(red: 22 / 255, green: 22 / 255, blue: 25 / 255)
    static let graphiteRaised = Color(red: 43 / 255, green: 43 / 255, blue: 48 / 255)
    static let graphiteBorder = Color(red: 41 / 255, green: 41 / 255, blue: 46 / 255)
    static let graphiteText = Color(red: 242 / 255, green: 242 / 255, blue: 244 / 255)
    static let graphitePrimary = Color(red: 169 / 255, green: 169 / 255, blue: 175 / 255)
    static let graphiteControl = Color(red: 169 / 255, green: 169 / 255, blue: 175 / 255)
    static let graphiteMuted = Color(red: 154 / 255, green: 154 / 255, blue: 162 / 255)
    static let graphiteTertiary = Color(red: 98 / 255, green: 98 / 255, blue: 106 / 255)
    static let graphiteButtonText = Color(red: 199 / 255, green: 199 / 255, blue: 204 / 255)
    static let graphiteWarning = Color(red: 217 / 255, green: 138 / 255, blue: 36 / 255)
}

@main
struct QuickMemoryApp: App {
    @StateObject private var store = StudyStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView(store: store)
                .tint(.graphitePrimary)
                .preferredColorScheme(.dark)
                .onAppear {
                    store.reconcileTimedSession()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .background {
                        store.flushPersistence()
                    } else if newPhase == .active {
                        store.reconcileTimedSession()
                    }
                }
        }
    }
}
