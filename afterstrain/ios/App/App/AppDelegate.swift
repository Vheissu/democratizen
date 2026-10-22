import UIKit
import Capacitor
import GameController

class AfterstrainViewController: CAPBridgeViewController {
    private var controllerObserver: NSObjectProtocol?
    private var lastMove = Date.distantPast

    override func viewDidLoad() {
        super.viewDidLoad()
        controllerObserver = NotificationCenter.default.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] notification in
            if let controller = notification.object as? GCController { self?.bind(controller) }
        }
        GCController.controllers().forEach { bind($0) }
    }

    deinit {
        if let observer = controllerObserver { NotificationCenter.default.removeObserver(observer) }
    }

    private func send(_ command: String) {
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('afterstrain-control',{detail:'\(command)'}))")
        }
    }

    private func bind(_ controller: GCController) {
        guard let pad = controller.extendedGamepad else { return }
        let bindings: [(GCControllerButtonInput, String)] = [
            (pad.buttonA, "select"), (pad.buttonB, "back"), (pad.buttonMenu, "pause"),
            (pad.leftShoulder, "region-prev"), (pad.rightShoulder, "region-next")
        ]
        for (button, command) in bindings {
            button.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.send(command) } }
        }
        for directionPad in [pad.dpad, pad.leftThumbstick] {
            directionPad.valueChangedHandler = { [weak self] _, horizontal, vertical in
                guard let self, Date().timeIntervalSince(self.lastMove) > 0.16 else { return }
                let command = vertical > 0.55 ? "up" : vertical < -0.55 ? "down" : horizontal < -0.55 ? "left" : horizontal > 0.55 ? "right" : nil
                if let command { self.lastMove = Date(); self.send(command) }
            }
        }
    }
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
