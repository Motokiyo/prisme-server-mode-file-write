import { describe, expect, test } from "bun:test"
import { resolveServerList, ServerConnection } from "./server"

describe("resolveServerList", () => {
  test("lets startup auth_token credentials override a persisted same-url server", () => {
    const list = resolveServerList({
      stored: [{ url: "https://server.example.test" }],
      props: [
        {
          type: "http",
          authToken: true,
          http: {
            url: "https://server.example.test",
            username: "opencode",
            password: "secret",
          },
        },
      ],
    })

    expect(list).toHaveLength(1)
    expect(list[0]?.type).toBe("http")
    expect(list[0]?.http).toEqual({
      url: "https://server.example.test",
      username: "opencode",
      password: "secret",
    })
    expect(list[0]?.type === "http" ? list[0].authToken : false).toBe(true)
    expect(ServerConnection.key(list[0]!) as string).toBe("https://server.example.test")
  })

  test("keeps persisted credentials when startup has no auth_token", () => {
    const list = resolveServerList({
      stored: [
        {
          url: "https://server.example.test",
          username: "opencode",
          password: "saved",
        },
      ],
      props: [{ type: "http", http: { url: "https://server.example.test" } }],
    })

    expect(list).toHaveLength(1)
    expect(list[0]?.type).toBe("http")
    expect(list[0]?.http).toEqual({
      url: "https://server.example.test",
      username: "opencode",
      password: "saved",
    })
    expect(list[0]?.type === "http" ? list[0].authToken : true).toBeUndefined()
  })

  // New behaviour (FIX B): credentials supplied at startup via ?auth_token=
  // are persisted into the server store (as a bare HttpBase, without the
  // transient authToken flag). The Server context's init effect writes this
  // shape; here we assert that a reload (which no longer carries the token in
  // the URL and so receives a credential-less prop) resolves to the persisted
  // credentials, allowing automatic re-authentication instead of a 401.
  test("reload after a persisted auth_token reauthenticates from stored credentials", () => {
    // Simulates the state after first load persisted the decoded credentials,
    // then the page reloaded without ?auth_token= in the URL.
    const stored = resolveServerList({
      stored: [
        {
          url: "https://server.example.test",
          username: "opencode",
          password: "secret",
        },
      ],
      props: [{ type: "http", authToken: false, http: { url: "https://server.example.test" } }],
    })

    expect(stored).toHaveLength(1)
    expect(stored[0]?.type).toBe("http")
    expect(stored[0]?.type === "http" ? stored[0].http.password : undefined).toBe("secret")
    // No token flag survives the reload — credentials come purely from storage.
    expect(stored[0]?.type === "http" ? stored[0].authToken : "x").toBeUndefined()
  })
})
