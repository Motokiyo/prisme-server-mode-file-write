import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { Link } from "@tiptap/extension-link"
import { Image } from "@tiptap/extension-image"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { Markdown } from "tiptap-markdown"
import { createSignal, onCleanup, onMount, type JSX, untrack } from "solid-js"
import "./markdown-editor.css"

export interface MarkdownEditorProps {
  initialContent: string
  onChange?: (markdown: string) => void
  readonly?: boolean
}

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: JSX.Element
}

type CommandChain = ReturnType<Editor["chain"]>

function ToolbarButton(props: ToolbarButtonProps) {
  return (
    <button
      type="button"
      class="markdown-editor-toolbar-button"
      classList={{ active: props.active, disabled: props.disabled }}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      tabIndex={-1}
    >
      {props.children}
    </button>
  )
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  let surface: HTMLDivElement | undefined
  let commitTimer: number | undefined
  let pendingCommit = false
  const [editor, setEditor] = createSignal<Editor | undefined>()
  const [selectionRev, setSelectionRev] = createSignal(0)

  const markdown = (instance: Editor) =>
    ((instance.storage as unknown as Record<string, { getMarkdown(): string }>).markdown).getMarkdown()

  const flushCommit = () => {
    if (commitTimer !== undefined) {
      window.clearTimeout(commitTimer)
      commitTimer = undefined
    }
    if (!pendingCommit) return
    const ed = editor()
    if (!ed) return
    pendingCommit = false
    props.onChange?.(markdown(ed))
  }

  const scheduleCommit = (instance: Editor) => {
    pendingCommit = true
    if (commitTimer !== undefined) window.clearTimeout(commitTimer)
    commitTimer = window.setTimeout(() => {
      commitTimer = undefined
      pendingCommit = false
      props.onChange?.(markdown(instance))
    }, 700)
  }

  onMount(() => {
    if (!surface) return
    const initialContent = untrack(() => props.initialContent)
    const ed = new Editor({
      element: surface,
      content: initialContent,
      editable: !untrack(() => props.readonly),
      extensions: [
        StarterKit.configure({}),
        Link.configure({ openOnClick: false }),
        Image,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        Markdown.configure({
          html: false,
          tightLists: true,
          breaks: false,
          linkify: true,
        }),
      ],
      editorProps: {
        attributes: {
          class: "markdown-editor-content",
        },
      },
      onUpdate: ({ editor: instance }) => {
        scheduleCommit(instance)
      },
      onBlur: flushCommit,
      onSelectionUpdate: () => setSelectionRev((value) => value + 1),
    })
    setEditor(ed)
  })

  onCleanup(() => {
    flushCommit()
    editor()?.destroy()
    if (commitTimer !== undefined) window.clearTimeout(commitTimer)
  })

  const isActive = (name: string, attrs?: Record<string, unknown>) => {
    selectionRev()
    const ed = editor()
    if (!ed) return false
    return ed.isActive(name, attrs)
  }

  const cmd = (fn: (chain: CommandChain) => void) => () => {
    const ed = editor()
    if (!ed) return
    const chain = ed.chain().focus()
    fn(chain)
  }

  return (
    <div class="markdown-editor" data-readonly={props.readonly ? "true" : undefined}>
      <div class="markdown-editor-toolbar" onMouseDown={(e) => e.preventDefault()}>
        <ToolbarButton title="Heading 1" active={isActive("heading", { level: 1 })} onClick={cmd((c) => c.toggleHeading({ level: 1 }).run())}>
          H1
        </ToolbarButton>
        <ToolbarButton title="Heading 2" active={isActive("heading", { level: 2 })} onClick={cmd((c) => c.toggleHeading({ level: 2 }).run())}>
          H2
        </ToolbarButton>
        <ToolbarButton title="Heading 3" active={isActive("heading", { level: 3 })} onClick={cmd((c) => c.toggleHeading({ level: 3 }).run())}>
          H3
        </ToolbarButton>
        <span class="markdown-editor-toolbar-sep" />
        <ToolbarButton title="Bold (Cmd+B)" active={isActive("bold")} onClick={cmd((c) => c.toggleBold().run())}>
          <b>B</b>
        </ToolbarButton>
        <ToolbarButton title="Italic (Cmd+I)" active={isActive("italic")} onClick={cmd((c) => c.toggleItalic().run())}>
          <i>I</i>
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" active={isActive("strike")} onClick={cmd((c) => c.toggleStrike().run())}>
          <s>S</s>
        </ToolbarButton>
        <ToolbarButton title="Inline code" active={isActive("code")} onClick={cmd((c) => c.toggleCode().run())}>
          {"</>"}
        </ToolbarButton>
        <span class="markdown-editor-toolbar-sep" />
        <ToolbarButton title="Bullet list" active={isActive("bulletList")} onClick={cmd((c) => c.toggleBulletList().run())}>
          -
        </ToolbarButton>
        <ToolbarButton title="Ordered list" active={isActive("orderedList")} onClick={cmd((c) => c.toggleOrderedList().run())}>
          1.
        </ToolbarButton>
        <span class="markdown-editor-toolbar-sep" />
        <ToolbarButton title="Quote" active={isActive("blockquote")} onClick={cmd((c) => c.toggleBlockquote().run())}>
          "
        </ToolbarButton>
        <ToolbarButton title="Code block" active={isActive("codeBlock")} onClick={cmd((c) => c.toggleCodeBlock().run())}>
          {"{ }"}
        </ToolbarButton>
        <ToolbarButton
          title="Link"
          active={isActive("link")}
          onClick={() => {
            const ed = editor()
            if (!ed) return
            const previous = (ed.getAttributes("link") as { href?: string }).href ?? ""
            const url = window.prompt("URL", previous)
            if (url === null) return
            if (url === "") {
              ed.chain().focus().extendMarkRange("link").unsetLink().run()
              return
            }
            ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
          }}
        >
          Link
        </ToolbarButton>
        <ToolbarButton
          title="Image"
          onClick={() => {
            const url = window.prompt("Image URL")
            if (!url) return
            const ed = editor()
            if (!ed) return
            ed.chain().focus().setImage({ src: url }).run()
          }}
        >
          Img
        </ToolbarButton>
        <ToolbarButton
          title="Insert table"
          onClick={cmd((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        >
          Tbl
        </ToolbarButton>
        <span class="markdown-editor-toolbar-sep" />
        <ToolbarButton title="Horizontal rule" onClick={cmd((c) => c.setHorizontalRule().run())}>
          HR
        </ToolbarButton>
        <ToolbarButton title="Undo (Cmd+Z)" onClick={cmd((c) => c.undo().run())}>
          Undo
        </ToolbarButton>
        <ToolbarButton title="Redo (Cmd+Shift+Z)" onClick={cmd((c) => c.redo().run())}>
          Redo
        </ToolbarButton>
      </div>
      <div ref={surface} class="markdown-editor-surface" />
    </div>
  )
}
