import { TerrainVisibilityConfig } from "../../../applications/terrain-visibility-config.mjs";
import { AbstractEditorTool } from "./abstract/abstract-editor-tool.mjs";

export class TerrainVisibilityEditorTool extends AbstractEditorTool {
	static APPLICATION_TYPE = TerrainVisibilityConfig;
}
