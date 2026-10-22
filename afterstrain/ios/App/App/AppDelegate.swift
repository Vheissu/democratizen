import UIKit
import Capacitor
import GameController

class AfterstrainViewController: CAPBridgeViewController {
    private var observers: [NSObjectProtocol] = []
    private var heldDirections: [ObjectIdentifier: String] = [:]
    private var repeatTimer: Timer?

    override func viewDidLoad() {
        super.viewDidLoad()
        observers.append(NotificationCenter.default.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] notification in
            if let controller = notification.object as? GCController { self?.bind(controller) }
        })
        observers.append(NotificationCenter.default.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] notification in
            if let controller = notification.object as? GCController { self?.heldDirections.removeValue(forKey: ObjectIdentifier(controller)) }
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.heldDirections.removeAll() })
        repeatTimer = Timer.scheduledTimer(withTimeInterval: 0.18, repeats: true) { [weak self] _ in
            guard let self else { return }
            for direction in self.heldDirections.values { self.send(direction) }
        }
        GCController.controllers().forEach { bind($0) }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--controller-smoke") {
            Task { @MainActor in await self.controllerSmoke() }
        }
        #endif
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        repeatTimer?.invalidate()
    }

    private func send(_ command: String) {
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('afterstrain-control',{detail:'\(command)'}))")
        }
    }

    private func bind(_ controller: GCController) {
        guard let pad = controller.extendedGamepad else {
            if let pad = controller.microGamepad {
                pad.buttonA.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.send("select") } }
                pad.buttonX.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.send("back") } }
                bindDirection(pad.dpad, controller: controller)
            }
            return
        }
        let bindings: [(GCControllerButtonInput, String)] = [
            (pad.buttonA, "select"), (pad.buttonB, "back"), (pad.buttonMenu, "pause"),
            (pad.leftShoulder, "region-prev"), (pad.rightShoulder, "region-next")
        ]
        for (button, command) in bindings {
            button.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.send(command) } }
        }
        for directionPad in [pad.dpad, pad.leftThumbstick] {
            bindDirection(directionPad, controller: controller)
        }
    }

    private func bindDirection(_ pad: GCControllerDirectionPad, controller: GCController) {
        let identifier = ObjectIdentifier(controller)
        pad.valueChangedHandler = { [weak self] _, horizontal, vertical in
            guard let self else { return }
            let command = vertical > 0.55 ? "up" : vertical < -0.55 ? "down" : horizontal < -0.55 ? "left" : horizontal > 0.55 ? "right" : nil
            if let command {
                if self.heldDirections[identifier] != command { self.send(command) }
                self.heldDirections[identifier] = command
            } else { self.heldDirections.removeValue(forKey: identifier) }
        }
    }

    #if DEBUG
    @MainActor private func controllerSmoke() async {
        var checks: [String] = []
        func javascript(_ source: String) async throws -> Any? { try await webView?.evaluateJavaScript(source) }
        func pause(_ milliseconds: UInt64 = 250) async { try? await Task.sleep(nanoseconds: milliseconds * 1_000_000) }
        func check(_ name: String, _ expression: String) async throws {
            guard (try await javascript(expression)) as? Bool == true else { throw NSError(domain: "ControllerSmoke", code: 1, userInfo: [NSLocalizedDescriptionKey: name]) }
            checks.append(name)
        }
        do {
            var ready = false
            for _ in 0..<600 {
                if (try? await javascript("!!document.querySelector('[data-action=setup]')")) as? Bool == true { ready = true; break }
                await pause(100)
            }
            guard ready else { throw NSError(domain: "ControllerSmoke", code: 2) }
            let controller = GCController.withExtendedGamepad()
            bind(controller)
            let pad = controller.extendedGamepad!
            func press(_ button: GCControllerButtonInput) async { button.setValue(1); await pause(60); button.setValue(0); await pause() }
            _ = try await javascript("document.querySelector('[data-action=setup]').focus()")
            await press(pad.buttonA)
            try await check("native A opens setup", "!!document.querySelector('#strain-name')")
            _ = try await javascript("document.querySelector('[data-action=start]').focus()")
            await press(pad.buttonA)
            try await check("native A starts playable world", "!!document.querySelector('canvas')")
            await press(pad.buttonMenu)
            try await check("Menu starts time", "document.querySelector('.timeline strong').textContent.includes('running')")
            await press(pad.buttonMenu)
            try await check("Menu pauses time", "document.querySelector('.timeline strong').textContent==='Paused'")
            _ = try await javascript("window.smokeRegion=document.querySelector('.country-select h2').textContent")
            await press(pad.rightShoulder)
            try await check("right shoulder changes region", "window.smokeRegion!==document.querySelector('.country-select h2').textContent")
            await press(pad.leftShoulder)
            try await check("left shoulder restores region", "window.smokeRegion===document.querySelector('.country-select h2').textContent")
            _ = try await javascript("document.querySelector('[data-action=tab-lab]').focus()")
            await press(pad.buttonA)
            try await check("controller opens lab", "!!document.querySelector('.lab')")
            _ = try await javascript("document.querySelector('[data-action=evolve-reach-0]').focus()")
            await press(pad.buttonA)
            try await check("controller purchases evolution", "JSON.parse(localStorage.getItem('afterstrain-save-v1')).traits['reach-0']===1")
            await press(pad.buttonB)
            try await check("B returns to world", "!!document.querySelector('canvas')")
            _ = try await javascript("window.smokeFocus=0;document.addEventListener('focusin',()=>window.smokeFocus++);document.querySelector('[data-action=tab-world]').focus();window.smokeFocus=0")
            pad.dpad.setValueForXAxis(1, yAxis: 0); await pause(60); pad.dpad.setValueForXAxis(0, yAxis: 0)
            pad.dpad.setValueForXAxis(1, yAxis: 0); await pause(60); pad.dpad.setValueForXAxis(0, yAxis: 0); await pause()
            try await check("rapid D-pad taps are retained", "window.smokeFocus>=2")
            _ = try await javascript("document.querySelector('[data-action=tab-world]').focus();window.smokeFocus=0")
            pad.leftThumbstick.setValueForXAxis(1, yAxis: 0); await pause(650)
            try await check("held stick repeats", "window.smokeFocus>=2")
            NotificationCenter.default.post(name: .GCControllerDidDisconnect, object: controller); await pause()
            _ = try await javascript("window.smokeStopped=window.smokeFocus")
            await pause(400)
            try await check("disconnect stops held movement", "window.smokeStopped===window.smokeFocus")
            NotificationCenter.default.post(name: .GCControllerDidConnect, object: controller)
            pad.leftThumbstick.setValueForXAxis(0, yAxis: 0)
            await press(pad.buttonB)
            try await check("reconnected controller works", "!!document.querySelector('.landing')")
            let result: [String: Any] = ["passed": true, "checks": checks]
            try JSONSerialization.data(withJSONObject: result, options: .prettyPrinted).write(to: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("controller-smoke.json"))
        } catch {
            let result: [String: Any] = ["passed": false, "checks": checks, "error": error.localizedDescription]
            try? JSONSerialization.data(withJSONObject: result, options: .prettyPrinted).write(to: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("controller-smoke.json"))
        }
    }
    #endif
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
