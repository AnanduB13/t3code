import type { EnvironmentId } from "@t3tools/contracts";
import {
  getProjectFaviconCacheKey,
  isProjectFaviconFallbackUrl,
} from "@t3tools/shared/projectFavicon";
import { FolderIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { useAssetUrl } from "../assets/assetUrls";
import { cn } from "~/lib/utils";

const loadedProjectFaviconSrcs = new Map<string, string>();

export function ProjectFavicon(input: {
  environmentId: EnvironmentId;
  cwd: string;
  className?: string | undefined;
  fallbackIcon?: ComponentType<{ className?: string }>;
}) {
  const src = useAssetUrl(input.environmentId, {
    _tag: "project-favicon",
    cwd: input.cwd,
  });
  const FallbackIcon = input.fallbackIcon ?? FolderIcon;
  const fallbackLabel = projectAvatarLabel(input.cwd);

  if (!src || isProjectFaviconFallbackUrl(src)) {
    return (
      <ProjectFaviconFallback
        className={input.className}
        icon={FallbackIcon}
        label={fallbackLabel}
        preferIcon={input.fallbackIcon !== undefined}
      />
    );
  }

  const cacheKey = getProjectFaviconCacheKey(input.environmentId, input.cwd, src);

  return (
    <ProjectFaviconImage
      key={cacheKey}
      cacheKey={cacheKey}
      src={src}
      className={input.className}
      fallbackIcon={FallbackIcon}
      fallbackLabel={fallbackLabel}
      preferFallbackIcon={input.fallbackIcon !== undefined}
    />
  );
}

function ProjectFaviconFallback({
  className,
  icon: Icon,
  label,
  preferIcon,
}: {
  readonly className?: string | undefined;
  readonly icon: ComponentType<{ className?: string }>;
  readonly label: string;
  readonly preferIcon: boolean;
}) {
  if (!preferIcon) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-[8px] font-bold leading-none text-white",
          className,
        )}
        style={{ backgroundColor: projectAvatarColor(label) }}
      >
        {label}
      </span>
    );
  }
  return <Icon className={cn("size-3.5 shrink-0 text-muted-foreground/50", className)} />;
}

function projectAvatarLabel(cwd: string): string {
  const directory =
    cwd
      .replace(/[/\\]+$/, "")
      .split(/[/\\]/)
      .at(-1) ?? "";
  const letter = directory.match(/[a-z0-9]/i)?.[0];
  return (letter ?? "?").toLocaleUpperCase();
}

function projectAvatarColor(label: string): string {
  const hue = [...label].reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) % 360,
    0,
  );
  return `hsl(${hue} 54% 42%)`;
}

function ProjectFaviconImage({
  cacheKey,
  src,
  className,
  fallbackIcon: FallbackIcon,
  fallbackLabel,
  preferFallbackIcon,
}: {
  readonly cacheKey: string;
  readonly src: string;
  readonly className?: string | undefined;
  readonly fallbackIcon: ComponentType<{ className?: string }>;
  readonly fallbackLabel: string;
  readonly preferFallbackIcon: boolean;
}) {
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(
    () => loadedProjectFaviconSrcs.get(cacheKey) ?? null,
  );
  const isLoading = displayedSrc !== src;
  const handleLoadError = (failedSrc: string) => {
    if (loadedProjectFaviconSrcs.get(cacheKey) === failedSrc) {
      loadedProjectFaviconSrcs.delete(cacheKey);
    }
    setDisplayedSrc((currentSrc) => (currentSrc === failedSrc ? null : currentSrc));
  };

  return (
    <>
      {displayedSrc === null ? (
        <ProjectFaviconFallback
          className={className}
          icon={FallbackIcon}
          label={fallbackLabel}
          preferIcon={preferFallbackIcon}
        />
      ) : null}
      {displayedSrc ? (
        <img
          src={displayedSrc}
          alt=""
          className={cn("size-3.5 shrink-0 rounded-sm object-contain", className)}
          onError={() => handleLoadError(displayedSrc)}
        />
      ) : null}
      {isLoading ? (
        <img
          src={src}
          alt=""
          // `display: none` lets browsers defer this request indefinitely in
          // an off-screen sidebar. Keep it visually absent without removing
          // it from layout so every project favicon is actually preloaded.
          className="pointer-events-none absolute size-px invisible"
          onLoad={() => {
            loadedProjectFaviconSrcs.set(cacheKey, src);
            setDisplayedSrc(src);
          }}
          onError={() => handleLoadError(src)}
        />
      ) : null}
    </>
  );
}
