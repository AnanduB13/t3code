import * as Schema from "effect/Schema";
import { EnvironmentId, type EnvironmentId as EnvironmentIdType } from "@t3tools/contracts";

import { useLocalStorage } from "~/hooks/useLocalStorage";

const COMPUTER_USE_HOST_ENABLED_STORAGE_KEY = "t3code:computer-use-host-enabled";
const COMPUTER_USE_ALLOWED_ENVIRONMENTS_STORAGE_KEY = "t3code:computer-use-allowed-environments";
const AllowedEnvironmentIds = Schema.NullOr(Schema.Array(EnvironmentId));

export const useComputerUseHostEnabled = () =>
  useLocalStorage(COMPUTER_USE_HOST_ENABLED_STORAGE_KEY, false, Schema.Boolean);

export const useComputerUseAllowedEnvironmentIds = (): [
  ReadonlyArray<EnvironmentIdType> | null,
  (
    value:
      | ReadonlyArray<EnvironmentIdType>
      | null
      | ((
          current: ReadonlyArray<EnvironmentIdType> | null,
        ) => ReadonlyArray<EnvironmentIdType> | null),
  ) => void,
] => useLocalStorage(COMPUTER_USE_ALLOWED_ENVIRONMENTS_STORAGE_KEY, null, AllowedEnvironmentIds);
