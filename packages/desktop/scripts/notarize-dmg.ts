#!/usr/bin/env bun

import { $ } from "bun"
import { readdir } from "node:fs/promises"
import path from "node:path"

const key = process.env.APPLE_API_KEY
const keyId = process.env.APPLE_API_KEY_ID
const issuer = process.env.APPLE_API_ISSUER

if (!key || !keyId || !issuer) {
  throw new Error("APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER are required")
}

const dist = path.resolve("dist")
const entries = await readdir(dist)
const dmgs = entries.filter((entry) => entry.endsWith(".dmg"))

if (dmgs.length === 0) {
  console.log("No DMG artifacts found")
  process.exit(0)
}

for (const dmg of dmgs) {
  const file = path.join(dist, dmg)
  console.log(`Notarizing ${dmg}`)
  await $`xcrun notarytool submit ${file} --key ${key} --key-id ${keyId} --issuer ${issuer} --wait`
  await $`xcrun stapler staple ${file}`
  await $`xcrun stapler validate ${file}`
}
