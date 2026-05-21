import { afterEach, describe, expect, test } from "bun:test"
import { ConfigProvider, Context, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { mkdir, readFile, symlink } from "node:fs/promises"
import path from "path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { ExperimentalHttpApiServer } from "../../src/server/routes/instance/httpapi/server"
import { FilePaths } from "../../src/server/routes/instance/httpapi/groups/file"
import { Server } from "../../src/server/server"
import { Instance } from "../../src/project/instance"
import * as Log from "@opencode-ai/core/util/log"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

void Log.init({ print: false })

const originalHttpApi = Flag.OPENCODE_EXPERIMENTAL_HTTPAPI

function authedApp(input: { password?: string }) {
  Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = true
  const handler = HttpRouter.toWebHandler(
    ExperimentalHttpApiServer.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            OPENCODE_SERVER_PASSWORD: input.password,
          }),
        ),
      ),
    ),
    { disableLogger: true },
  ).handler
  return (request: Request) => handler(request, ExperimentalHttpApiServer.context)
}

function basicAuth(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

const context = Context.empty() as Context.Context<unknown>

function request(
  route: string,
  directory: string,
  query?: Record<string, string>,
  init?: RequestInit,
) {
  const url = new URL(`http://localhost${route}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value)
  }
  return ExperimentalHttpApiServer.webHandler().handler(
    new Request(url, {
      ...init,
      headers: {
        ...init?.headers,
        "x-opencode-directory": directory,
      },
    }),
    context,
  )
}

async function readEtag(directory: string, file: string) {
  const response = await request(FilePaths.content, directory, { path: file })
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(typeof body.etag).toBe("string")
  return body.etag as string
}

function writeRequest(directory: string, body: unknown) {
  return request(FilePaths.content, directory, undefined, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

afterEach(async () => {
  Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = originalHttpApi
  await disposeAllInstances()
  await resetDatabase()
})

describe("file HttpApi", () => {
  test("serves read endpoints", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "hello.txt"), "hello\n")

    const [list, content, status] = await Promise.all([
      request(FilePaths.list, tmp.path, { path: "." }),
      request(FilePaths.content, tmp.path, { path: "hello.txt" }),
      request(FilePaths.status, tmp.path),
    ])

    expect(list.status).toBe(200)
    expect(await list.json()).toContainEqual(
      expect.objectContaining({ name: "hello.txt", path: "hello.txt", type: "file" }),
    )

    expect(content.status).toBe(200)
    expect(await content.json()).toMatchObject({ type: "text", content: "hello\n" })

    expect(status.status).toBe(200)
    expect(await status.json()).toContainEqual({ path: "hello.txt", added: 2, removed: 0, status: "added" })
  })

  test("serves PDF files as base64 for preview", async () => {
    await using tmp = await tmpdir({ git: true })
    // A minimal PDF header is enough to exercise the base64 transport path.
    const pdfBytes = Buffer.from("%PDF-1.4\n%\xff\xff\xff\xff\n1 0 obj\n<< >>\nendobj\n", "latin1")
    await Bun.write(path.join(tmp.path, "doc.pdf"), pdfBytes)

    const content = await request(FilePaths.content, tmp.path, { path: "doc.pdf" })
    expect(content.status).toBe(200)
    const body = await content.json()
    expect(body.encoding).toBe("base64")
    expect(body.mimeType).toBe("application/pdf")
    expect(typeof body.content).toBe("string")
    expect(body.content.length).toBeGreaterThan(0)
    // Round-trips back to the original bytes.
    expect(Buffer.from(body.content, "base64").equals(pdfBytes)).toBe(true)
  })

  test("serves search endpoints", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "hello.txt"), "needle")

    const [text, files, symbols] = await Promise.all([
      request(FilePaths.findText, tmp.path, { pattern: "needle" }),
      request(FilePaths.findFile, tmp.path, { query: "hello", type: "file" }),
      request(FilePaths.findSymbol, tmp.path, { query: "hello" }),
    ])

    expect(text.status).toBe(200)
    expect(await text.json()).toContainEqual(expect.objectContaining({ line_number: 1 }))

    expect(files.status).toBe(200)
    expect(Array.isArray(await files.json())).toBe(true)

    expect(symbols.status).toBe(200)
    expect(await symbols.json()).toEqual([])
  })

  test("writes existing markdown files with an etag", async () => {
    await using tmp = await tmpdir({ git: true })
    const file = path.join(tmp.path, "notes.md")
    await Bun.write(file, "before\n")

    const etag = await readEtag(tmp.path, "notes.md")
    const response = await writeRequest(tmp.path, {
      path: "notes.md",
      content: "after\n",
      etag,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, bytes: 6 })
    expect(await readFile(file, "utf8")).toBe("after\n")
  })

  test("rejects stale markdown writes", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "notes.md"), "before\n")

    const etag = await readEtag(tmp.path, "notes.md")
    await Bun.write(path.join(tmp.path, "notes.md"), "external\n")

    const response = await writeRequest(tmp.path, {
      path: "notes.md",
      content: "after\n",
      etag,
    })

    expect(response.status).toBe(409)
    expect(await readFile(path.join(tmp.path, "notes.md"), "utf8")).toBe("external\n")
  })

  test("rejects unsafe markdown write paths", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "notes.md"), "safe\n")
    const etag = await readEtag(tmp.path, "notes.md")

    const cases = [
      { path: "/etc/passwd", status: 400 },
      { path: "../outside.md", status: 400 },
      { path: ".hidden.md", status: 403 },
      { path: "notes.env", status: 400 },
      { path: "notes\\test.md", status: 400 },
      { path: "notes\0.md", status: 400 },
    ]

    for (const item of cases) {
      const response = await writeRequest(tmp.path, {
        path: item.path,
        content: "unsafe\n",
        etag,
      })
      expect(response.status).toBe(item.status)
    }
  })

  test("rejects writes to nonexistent markdown files without creating them", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "notes.md"), "safe\n")
    const etag = await readEtag(tmp.path, "notes.md")

    const target = path.join(tmp.path, "brand-new.md")
    const response = await writeRequest(tmp.path, {
      path: "brand-new.md",
      content: "created\n",
      etag,
    })

    expect(response.status).toBe(400)
    expect(await Bun.file(target).exists()).toBe(false)
  })

  test("rejects symlink markdown writes", async () => {
    await using tmp = await tmpdir({ git: true })
    const outside = path.join(tmp.path, "..", "outside.md")
    await Bun.write(outside, "outside\n")
    await symlink(outside, path.join(tmp.path, "linked.md"))

    const response = await writeRequest(tmp.path, {
      path: "linked.md",
      content: "unsafe\n",
      etag: "anything",
    })

    expect(response.status).toBe(403)
    expect(await readFile(outside, "utf8")).toBe("outside\n")
  })

  test("rejects markdown writes through symlink directories", async () => {
    await using tmp = await tmpdir({ git: true })
    const outside = path.join(tmp.path, "..", "outside-dir")
    await mkdir(outside, { recursive: true })
    await Bun.write(path.join(outside, "notes.md"), "outside\n")
    await symlink(outside, path.join(tmp.path, "linked-dir"))

    const response = await writeRequest(tmp.path, {
      path: "linked-dir/notes.md",
      content: "unsafe\n",
      etag: "anything",
    })

    expect(response.status).toBe(403)
    expect(await readFile(path.join(outside, "notes.md"), "utf8")).toBe("outside\n")
  })

  test("rejects markdown writes over the maximum size", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "notes.md"), "safe\n")
    const etag = await readEtag(tmp.path, "notes.md")

    const response = await writeRequest(tmp.path, {
      path: "notes.md",
      content: "x".repeat(1024 * 1024 + 1),
      etag,
    })

    expect(response.status).toBe(413)
    expect(await readFile(path.join(tmp.path, "notes.md"), "utf8")).toBe("safe\n")
  })

  test("requires auth for the PUT write route when a password is configured", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "notes.md"), "before\n")
    const fetchHandler = authedApp({ password: "secret" })

    const url = new URL(FilePaths.content, "http://localhost")
    const body = JSON.stringify({ path: "notes.md", content: "after\n", etag: "anything" })

    const unauthorized = await fetchHandler(
      new Request(url, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-opencode-directory": tmp.path },
        body,
      }),
    )
    expect(unauthorized.status).toBe(401)
    expect(await readFile(path.join(tmp.path, "notes.md"), "utf8")).toBe("before\n")

    const authorized = await fetchHandler(
      new Request(url, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-opencode-directory": tmp.path,
          authorization: basicAuth("opencode", "secret"),
        },
        body,
      }),
    )
    // Auth passes; the write itself is rejected (stale etag) rather than 401.
    expect(authorized.status).not.toBe(401)
  })
})

describe("file Hono legacy route", () => {
  function legacyRequest(directory: string, route: string, init?: RequestInit) {
    Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = false
    return Server.Legacy().app.request(route, {
      ...init,
      headers: { ...init?.headers, "x-opencode-directory": directory },
    })
  }

  async function legacyEtag(directory: string, file: string) {
    const url = `${FilePaths.content}?${new URLSearchParams({ path: file })}`
    const response = await legacyRequest(directory, url)
    expect(response.status).toBe(200)
    const body = await response.json()
    return body.etag as string
  }

  function legacyWrite(directory: string, payload: unknown) {
    return legacyRequest(directory, FilePaths.content, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  }

  test("writes existing markdown via the Hono PUT route", async () => {
    await using tmp = await tmpdir({ git: true })
    const file = path.join(tmp.path, "notes.md")
    await Bun.write(file, "before\n")

    const etag = await legacyEtag(tmp.path, "notes.md")
    const response = await legacyWrite(tmp.path, { path: "notes.md", content: "after\n", etag })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, bytes: 6 })
    expect(await readFile(file, "utf8")).toBe("after\n")
  })

  test("rejects oversized markdown via the Hono PUT route with 413", async () => {
    await using tmp = await tmpdir({ git: true })
    const file = path.join(tmp.path, "notes.md")
    await Bun.write(file, "safe\n")

    const etag = await legacyEtag(tmp.path, "notes.md")
    const response = await legacyWrite(tmp.path, {
      path: "notes.md",
      content: "x".repeat(1024 * 1024 + 1),
      etag,
    })

    expect(response.status).toBe(413)
    expect(await readFile(file, "utf8")).toBe("safe\n")
  })

  test("rejects unsafe paths via the Hono PUT route", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "notes.md"), "safe\n")
    const etag = await legacyEtag(tmp.path, "notes.md")

    const response = await legacyWrite(tmp.path, { path: "/etc/passwd", content: "unsafe\n", etag })
    expect(response.status).toBe(400)
  })
})
