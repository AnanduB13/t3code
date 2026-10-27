import type { ComposerEditorSelection } from "../../components/ComposerEditor";

export type VoiceInputControllerInput = {
  readonly ownerKey: string | null;
  readonly draftMessage: string;
  readonly selection: ComposerEditorSelection;
  readonly disabled?: boolean;
  readonly onChangeDraftMessage: (value: string) => void;
  readonly onChangeSelection: (selection: ComposerEditorSelection) => void;
};
