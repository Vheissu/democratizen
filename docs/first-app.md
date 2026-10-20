# Your first TV app

Get a small widget onto the screen before adding a backend or a framework. The included `study-tv-lab/` app shows a clock. OK changes its colour; Back exits. Its original package name, `StudyTVLab`, is kept so existing installations can be updated.

## Deploy the included example

Complete [Developer Mode](developer-mode.md) and [signing](signing.md), then set your target and profile:

```sh
export TV_IP=192.168.1.50
export TIZEN_STUDIO_HOME="$HOME/tizen-studio"
export SAMSUNG_SIGNING_PROFILE=MySamsungTV
npm run deploy:hello
```

The command should finish with a successful install and launch. On the TV, check that the clock changes, OK changes the screen colour, and Back closes the app. Those checks establish that your author certificate, TV authorization and basic input events all work.

## What the deploy script does

You can run the same sequence manually:

```sh
export TIZEN_CLI="$TIZEN_STUDIO_HOME/tools/ide/bin/tizen"
export SDB="$TIZEN_STUDIO_HOME/tools/sdb"

"$TIZEN_CLI" build-web -- study-tv-lab
"$TIZEN_CLI" package -t wgt -s "$SAMSUNG_SIGNING_PROFILE" -- study-tv-lab/.buildResult
"$SDB" connect "$TV_IP:26101"
"$TIZEN_CLI" install -s "$TV_IP:26101" -n StudyTVLab.wgt -- study-tv-lab/.buildResult
"$TIZEN_CLI" run -s "$TV_IP:26101" -p wbnosstudy.StudyLab
```

`build-web` prepares the web project. `package` signs a `.wgt` archive. `install` transfers it to the device; `run` launches the application ID from the manifest. A successful build says nothing about whether the TV accepted the signature. Read each stage's result. Samsung documents the CLI [here](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html).

## Make it your app

Copy `study-tv-lab/` into a new directory. Exclude its generated `.buildResult/` if you've already built it. Change the widget identity, application ID, package ID and name in `config.xml` before installing a separate app. This example uses the ten-character package ID `dmtznhello`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets"
        xmlns:tizen="http://tizen.org/ns/widgets"
        id="https://example.org/hello-tv" version="1.0.0" viewmodes="maximized">
  <tizen:application id="dmtznhello.HelloTV" package="dmtznhello" required_version="2.3"/>
  <content src="index.html"/>
  <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>
  <icon src="icon.png"/>
  <name>HelloTV</name>
  <tizen:profile name="tv-samsung"/>
  <tizen:setting screen-orientation="landscape" context-menu="disable"
                 background-support="disable" encryption="disable"
                 install-location="auto" hwkey-event="enable"/>
</widget>
```

Use IDs unique to your app. For an update, preserve its IDs and author certificate and increase the version. For a separate app, give it separate IDs. Keep the icon at the path the manifest names.

Change the text in `index.html`, the styles in `style.css`, and input behaviour in `main.js`. Build your new directory and substitute `HelloTV.wgt` and `dmtznhello.HelloTV` in the install/run commands. You don't need a web framework to get started.

For larger apps, continue with [building apps](building-apps.md).
