# Getting into the TV

Developer Mode lets Samsung's tools connect to the TV and run signed development apps. Start here even if your eventual goal is root access.

## Enable Developer Mode

On the tested Frame:

1. Press Home and open **Apps**.
2. Scroll down to **App Settings**.
3. Enter `12345` using the remote's number keys or its on-screen number pad.
4. Set **Developer Mode** to **On**.
5. Enter the computer's LAN IPv4 address in **Host PC IP**.
6. Confirm and reboot the TV.

These are also the steps in Samsung's [TV device guide](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html). Older interfaces may show the popup directly from the Apps panel. A compact remote with a `123` button can work; a full number-button remote makes entering the sequence easier.

On this Frame, the power button's normal standby cycle wasn't enough. After saving the setting, fully disconnect power, reconnect it, and start the TV again. Don't interrupt a firmware update. Reopen Apps and check for the Developer Mode indicator.

The Host PC IP field takes your computer's address. The TV's own address is the destination for the next step. A SmartThings remote-control connection or a Samsung Remote Management PIN doesn't replace this setup.

## Connect with SDB

```sh
export TV_IP=192.168.1.50
export TIZEN_STUDIO_HOME="$HOME/tizen-studio"
export SDB="$TIZEN_STUDIO_HOME/tools/sdb"

"$SDB" connect "$TV_IP:26101"
"$SDB" devices
```

Look for your exact `IP:26101` followed by `device`. `offline` or a connection timeout needs fixing before signing or deploying. When multiple TVs are connected, always pass `-s "$TV_IP:26101"` to commands that choose a target.

Retrieve the DUID for certificate creation:

```sh
"$SDB" -s "$TV_IP:26101" shell 0 getduid
```

It can also be available in the TV's support/about information or Certificate Manager's connected-device list. Treat the DUID as private device information when sharing screenshots or logs.

## What an SDB connection gives you

The retail TV exposes a restricted development interface. It can install and launch correctly signed widgets and answer supported device commands. A plain `sdb shell` may immediately print `closed`; that was expected on the tested retail firmware. It doesn't mean the app deployment connection is broken.

An app is also sandboxed. A JavaScript widget can't simply execute a host command or become a TV root shell. Frame Terminal talks to a separate process on the computer. The [optional root route](root-access.md) is a separate operation with different prerequisites and effects.

## If port 26101 stays closed

Check the saved Host PC IP against the computer's current LAN address, repeat the full power cycle, and confirm you're connecting to the TV's current address. Then check guest-network isolation, VPN routing and the host firewall. Samsung documents `26101` as an internal development port; router port forwarding isn't a setup step.

Once the TV appears as `device`, continue to [signing](signing.md).
