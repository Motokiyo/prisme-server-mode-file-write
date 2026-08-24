import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return
  if (process.env.WINDOWS_SIGNING_ENABLED !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

const channel = (() => {
  const raw = process.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

// Signature macOS : sans certificat Developer ID ni cle App Store Connect, on
// produit une build NON SIGNEE au lieu d'echouer. electron-builder interprete un
// CSC_LINK vide comme un chemin de fichier ("<dir> not a file"), d'ou identity: null
// qui court-circuite entierement la signature.
const macSigned = Boolean(process.env.CSC_LINK) && Boolean(process.env.APPLE_API_KEY_ID)

const githubPublish = {
  provider: "github" as const,
  owner: "Motokiyo",
  repo: "prisme-server-mode-file-write",
  channel: channel === "beta" ? "beta" : "latest",
  releaseType: channel === "beta" ? ("prerelease" as const) : ("release" as const),
}

const getBase = (): Configuration => ({
  artifactName: "prisme-desktop-${os}-${arch}.${ext}",
  publish: [githubPublish],
  npmRebuild: false,
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: ["out/**/*", "resources/**/*"],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
  ],
  mac: {
    category: "public.app-category.productivity",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: macSigned,
    gatekeeperAssess: false,
    ...(macSigned ? {} : { identity: null }),
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    extendInfo: {
      NSMicrophoneUsageDescription: "Prisme uses the microphone to transcribe your voice into chat messages.",
    },
    notarize: macSigned,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: macSigned,
  },
  protocols: {
    name: "Prisme",
    schemes: ["prisme"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    target: ["AppImage", "deb", "rpm"],
    desktop: {
      entry: {
        StartupWMClass: "Prisme",
      },
    },
  },
})

function getConfig() {
  const base = getBase()

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId: "ai.prisme.desktop.dev",
        productName: "Prisme Dev",
        linux: { ...base.linux, executableName: "prisme-dev" },
        rpm: { packageName: "prisme-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId: "ai.prisme.desktop.beta",
        productName: "Prisme Beta",
        protocols: { name: "Prisme Beta", schemes: ["prisme"] },
        linux: { ...base.linux, executableName: "prisme-beta" },
        rpm: { packageName: "prisme-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId: "ai.prisme.desktop",
        productName: "Prisme",
        protocols: { name: "Prisme", schemes: ["prisme"] },
        linux: { ...base.linux, executableName: "prisme" },
        rpm: { packageName: "prisme" },
      }
    }
  }
}

export default getConfig()
