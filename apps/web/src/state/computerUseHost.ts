import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

export const COMPUTER_USE_HOST_ENABLED_STORAGE_KEY = "t3code:computer-use-host-enabled";

export const useComputerUseHostEnabled = () =>
  useLocalStorage(COMPUTER_USE_HOST_ENABLED_STORAGE_KEY, false, Schema.Boolean);
