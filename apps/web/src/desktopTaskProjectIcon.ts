import { ProjectIconOverride } from "@t3tools/contracts";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import * as Effect from "effect/Effect";
import * as Base64 from "effect/encoding/Base64";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";

const decodeIcon = Schema.decodeUnknownSync(Schema.fromJsonString(ProjectIconOverride));
const svgNamespace = "http://www.w3.org/2000/svg";

/** Convert the existing project identity into a self-contained image for the sandboxed panel. */
export async function createDesktopTaskProjectIcon(icon: ProjectIconOverride): Promise<string> {
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("xmlns", svgNamespace);
  svg.setAttribute("viewBox", "0 0 24 24");
  const color =
    icon.kind === "emoji"
      ? "#fff"
      : getComputedStyle(document.documentElement)
          .getPropertyValue(`--color-${icon.color}-400`)
          .trim() || "#a1a1aa";
  if (icon.kind === "lucide") {
    const load =
      dynamicIconImports[icon.name as keyof typeof dynamicIconImports] ??
      dynamicIconImports["folder-code"];
    const { __iconNode } = await load();
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", color);
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const [tag, attributes] of __iconNode) {
      const node = document.createElementNS(svgNamespace, tag);
      for (const [name, value] of Object.entries(attributes)) {
        if (name !== "key") node.setAttribute(name, String(value));
      }
      svg.append(node);
    }
  } else {
    if (icon.kind === "monogram") {
      const background = document.createElementNS(svgNamespace, "rect");
      for (const [name, value] of Object.entries({
        width: "24",
        height: "24",
        rx: "6",
        fill: color,
        "fill-opacity": ".14",
      }))
        background.setAttribute(name, value);
      svg.append(background);
    }
    const text = document.createElementNS(svgNamespace, "text");
    text.setAttribute("x", "12");
    text.setAttribute("y", "16.5");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", icon.kind === "emoji" ? "18" : "12");
    text.setAttribute("font-family", "-apple-system, BlinkMacSystemFont, sans-serif");
    text.setAttribute("font-weight", "700");
    text.setAttribute("fill", color);
    text.textContent = icon.kind === "emoji" ? icon.emoji : icon.text;
    if (icon.kind === "monogram") {
      text.setAttribute("textLength", "18");
      text.setAttribute("lengthAdjust", "spacingAndGlyphs");
    }
    svg.append(text);
  }
  return `data:image/svg+xml;base64,${Base64.encode(new TextEncoder().encode(svg.outerHTML))}`;
}

const family = Atom.family((key: string) =>
  Atom.make(Effect.promise(() => createDesktopTaskProjectIcon(decodeIcon(key)))).pipe(
    Atom.setIdleTTL(60_000),
  ),
);

export const desktopTaskProjectIconAtom = (icon: ProjectIconOverride) =>
  family(JSON.stringify(icon));
