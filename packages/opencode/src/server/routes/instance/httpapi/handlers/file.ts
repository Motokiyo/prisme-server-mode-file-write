import * as InstanceState from "@/effect/instance-state"
import { File } from "@/file"
import { Ripgrep } from "@/file/ripgrep"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  FileWriteBadRequestError,
  FileWriteConflictError,
  FileWriteForbiddenError,
  FileWriteTooLargeError,
} from "../groups/file"

export const fileHandlers = HttpApiBuilder.group(InstanceHttpApi, "file", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* File.Service
    const ripgrep = yield* Ripgrep.Service

    const findText = Effect.fn("FileHttpApi.findText")(function* (ctx: { query: { pattern: string } }) {
      return (yield* ripgrep
        .search({ cwd: (yield* InstanceState.context).directory, pattern: ctx.query.pattern, limit: 10 })
        .pipe(Effect.orDie)).items
    })

    const findFile = Effect.fn("FileHttpApi.findFile")(function* (ctx: {
      query: { query: string; dirs?: "true" | "false"; type?: "file" | "directory"; limit?: number }
    }) {
      return yield* svc.search({
        query: ctx.query.query,
        limit: ctx.query.limit ?? 10,
        dirs: ctx.query.dirs !== "false",
        type: ctx.query.type,
      })
    })

    const findSymbol = Effect.fn("FileHttpApi.findSymbol")(function* () {
      return []
    })

    const list = Effect.fn("FileHttpApi.list")(function* (ctx: { query: { path: string } }) {
      return yield* svc.list(ctx.query.path)
    })

    const content = Effect.fn("FileHttpApi.content")(function* (ctx: { query: { path: string } }) {
      return yield* svc.read(ctx.query.path)
    })

    const write = Effect.fn("FileHttpApi.write")(function* (ctx: { payload: File.WriteInput }) {
      return yield* svc.write(ctx.payload).pipe(
        Effect.catch(
          (
            error: File.WriteError,
          ): Effect.Effect<
            never,
            | FileWriteBadRequestError
            | FileWriteForbiddenError
            | FileWriteConflictError
            | FileWriteTooLargeError
          > => {
            if (error.status === 403) return Effect.fail(new FileWriteForbiddenError({ message: error.message }))
            if (error.status === 409) return Effect.fail(new FileWriteConflictError({ message: error.message }))
            if (error.status === 413) return Effect.fail(new FileWriteTooLargeError({ message: error.message }))
            return Effect.fail(new FileWriteBadRequestError({ message: error.message }))
          },
        ),
      )
    })

    const status = Effect.fn("FileHttpApi.status")(function* () {
      return yield* svc.status()
    })

    return handlers
      .handle("findText", findText)
      .handle("findFile", findFile)
      .handle("findSymbol", findSymbol)
      .handle("list", list)
      .handle("content", content)
      .handle("write", write)
      .handle("status", status)
  }),
)
