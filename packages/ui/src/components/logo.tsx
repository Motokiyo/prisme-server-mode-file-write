import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 16H32" stroke="var(--icon-weak-base)" stroke-width="2" stroke-opacity="0.4" />
      <path
        d="M16 4L28 26H4L16 4Z"
        fill="var(--icon-weak-base)"
        fill-opacity="0.15"
        stroke="var(--icon-strong-base)"
        stroke-width="1.5"
      />
      <path d="M10 16H22" stroke="var(--icon-strong-base)" stroke-width="2" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 16H32" stroke="var(--icon-base)" stroke-width="2" stroke-opacity="0.4" />
      <path
        d="M16 4L28 26H4L16 4Z"
        fill="var(--icon-base)"
        fill-opacity="0.15"
        stroke="var(--icon-strong-base)"
        stroke-width="1.5"
      />
      <path d="M10 16H22" stroke="var(--icon-strong-base)" stroke-width="2" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <span
      data-component="logo-wordmark"
      classList={{ [props.class ?? ""]: !!props.class }}
      style={{ display: "inline-flex", "align-items": "center", gap: "8px" }}
    >
      <Mark />
      <span
        style={{
          "font-weight": "600",
          "letter-spacing": "0.02em",
          color: "var(--icon-strong-base)",
          "font-size": "1.25em",
        }}
      >
        Prisme
      </span>
    </span>
  )
}
