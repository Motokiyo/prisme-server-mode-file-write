import { $ } from "bun"

import { copyBinaryToSidecarFolder, getCurrentSidecar } from "./utils"

const PLATFORM_TO_TARGET: Record<string, string> = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
}

const detectedTarget = PLATFORM_TO_TARGET[`${process.platform}-${process.arch}`]
const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE ?? detectedTarget

if (!RUST_TARGET) {
  throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`)
}

getCurrentSidecar(RUST_TARGET)

const homeBin = `${Bun.env.HOME}/.opencode/bin/opencode`
const pathBin = await $`which opencode`
  .text()
  .then((s) => s.trim())
  .catch(() => "")

let binaryPath = ""
if (await Bun.file(homeBin).exists()) {
  binaryPath = homeBin
} else if (pathBin) {
  binaryPath = pathBin
}

if (!binaryPath) {
  throw new Error(
    "opencode CLI not found. Install it first:\n  curl -fsSL https://opencode.ai/install | bash\nor: npm i -g opencode-ai",
  )
}

await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)
