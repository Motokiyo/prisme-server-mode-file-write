import { createContext, useContext, type ParentProps } from "solid-js"
import type { FileReference } from "../components/file-reference"

export type { FileReference } from "../components/file-reference"

/**
 * Handler the app provides to open a file referenced in a chat message.
 * Lives in the app layer because opening a file requires session/file context;
 * the UI layer only detects references and delegates the actual open.
 *
 * Implementations MUST keep opening workspace-scoped (reuse the existing,
 * already-scoped open path). They never receive an unsafe path: the detector in
 * `file-reference.ts` rejects absolute paths and `..` traversal before a span is
 * ever made clickable.
 */
export type OpenFileReference = (reference: FileReference) => void

const ctx = createContext<OpenFileReference>()

export function FileReferenceProvider(props: ParentProps<{ onOpen: OpenFileReference }>) {
  return <ctx.Provider value={props.onOpen}>{props.children}</ctx.Provider>
}

/**
 * Returns the open handler, or `undefined` when no provider is mounted (e.g.
 * outside a session). Markdown uses this to decide whether to linkify file
 * references at all — no handler means references stay plain text.
 */
export function useFileReference(): OpenFileReference | undefined {
  return useContext(ctx)
}
