export interface ComputerUseBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ComputerUseCoordinateSpace extends ComputerUseBounds {
  readonly screenshotWidth: number;
  readonly screenshotHeight: number;
}

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

export const assertValidCoordinateSpace = (space: ComputerUseCoordinateSpace): void => {
  if (
    !Number.isFinite(space.x) ||
    !Number.isFinite(space.y) ||
    !finitePositive(space.width) ||
    !finitePositive(space.height) ||
    !finitePositive(space.screenshotWidth) ||
    !finitePositive(space.screenshotHeight)
  ) {
    throw new Error("The observed window has an invalid coordinate space. Observe it again.");
  }
};

/** Maps a point in the returned PNG to the OS logical desktop coordinate space. */
export const screenshotPointToScreen = (
  space: ComputerUseCoordinateSpace,
  point: { readonly x: number; readonly y: number },
): { x: number; y: number } => {
  assertValidCoordinateSpace(space);
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.y < 0 ||
    point.x >= space.screenshotWidth ||
    point.y >= space.screenshotHeight
  ) {
    throw new Error(
      `Screenshot coordinate (${point.x}, ${point.y}) is outside ${space.screenshotWidth}x${space.screenshotHeight}.`,
    );
  }
  return {
    x: Math.round(space.x + (point.x / space.screenshotWidth) * space.width),
    y: Math.round(space.y + (point.y / space.screenshotHeight) * space.height),
  };
};

export const boundsMatch = (
  left: ComputerUseBounds,
  right: ComputerUseBounds,
  tolerance = 2,
): boolean =>
  Math.abs(left.x - right.x) <= tolerance &&
  Math.abs(left.y - right.y) <= tolerance &&
  Math.abs(left.width - right.width) <= tolerance &&
  Math.abs(left.height - right.height) <= tolerance;

export const absoluteBoundsToScreenshot = (
  space: ComputerUseCoordinateSpace,
  bounds: ComputerUseBounds,
): ComputerUseBounds => {
  assertValidCoordinateSpace(space);
  return {
    x: Math.round(((bounds.x - space.x) / space.width) * space.screenshotWidth),
    y: Math.round(((bounds.y - space.y) / space.height) * space.screenshotHeight),
    width: Math.round((bounds.width / space.width) * space.screenshotWidth),
    height: Math.round((bounds.height / space.height) * space.screenshotHeight),
  };
};

export const selectUniqueWindowByTitle = <T extends { readonly title: string }>(
  windows: readonly T[],
  requestedTitle: string,
): T => {
  const query = requestedTitle.trim().toLocaleLowerCase();
  const exact = windows.filter((window) => window.title.trim().toLocaleLowerCase() === query);
  if (exact.length === 1) return exact[0]!;
  const prefix = windows.filter((window) =>
    window.title.trim().toLocaleLowerCase().startsWith(query),
  );
  if (prefix.length === 1) return prefix[0]!;
  const partial = windows.filter((window) => window.title.toLocaleLowerCase().includes(query));
  if (partial.length === 1) return partial[0]!;
  const matches = exact.length > 0 ? exact : prefix.length > 0 ? prefix : partial;
  if (matches.length > 1) {
    throw new Error(
      `Window name ${JSON.stringify(requestedTitle)} is ambiguous. Matches: ${matches.map((window) => window.title).join(", ")}.`,
    );
  }
  throw new Error(`No visible application window matches ${JSON.stringify(requestedTitle)}.`);
};
