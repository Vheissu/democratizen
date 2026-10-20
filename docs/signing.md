# Signing and certificates

A widget needs a valid signature before the TV will install it. Create your own profile using Samsung's [certificate workflow](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).

## Create a profile

Open **Tools → Certificate Manager** in Tizen Studio, add a **Samsung → TV** profile, and give it a name such as `MySamsungTV`. Create or import an author certificate, complete the Samsung account sign-in, and back it up privately. Create a distributor certificate with the public privilege level and include the target TV's DUID. Finish the wizard.

The author certificate identifies the app's author. Keep the same one for updates to an installed app. The distributor certificate authorizes installation on the listed TV devices. A generic Tizen certificate or a profile containing another TV's DUID can produce an installation failure.

```sh
export SAMSUNG_SIGNING_PROFILE=MySamsungTV
"$TIZEN_STUDIO_HOME/tools/ide/bin/tizen" security-profiles list
```

Match the name exactly. The scripts retain `StudyFramePublic` as a legacy default; new installations should set their own name explicitly.

## Check signing independently

```sh
npm run deploy:hello
```

The script builds `study-tv-lab/`, packages `StudyTVLab.wgt` using your profile, connects to the chosen TV, installs, and launches it. If your SDK's Device Manager offers **Permit to install applications**, use that action for the connected TV when troubleshooting authorization.

CLI signing uses the profiles configured in that SDK installation. If Certificate Manager and the CLI are reading different data directories, the profile can appear in the GUI yet be absent from CLI output. Check `tizen cli-config -l` and that installation's profile configuration. Keep profile XML, password records and certificate authorities in stable private locations; temporary files disappear.

Never paste a certificate password into a public issue or commit `author.p12`, `distributor.p12`, `.pwd` files, profile XML, or a widget containing terminal pairing credentials. [SECURITY.md](../SECURITY.md) explains which generated files are private.
