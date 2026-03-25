import Toolbar from "./Toolbar";
import RowEditor from "./RowEditor";

export default function EditorPanel({ spec, dispatch, undo, redo, canUndo, canRedo }) {
  return (
    <div
      style={{
        fontSize: 12,
        overflow: "auto",
        maxHeight: "calc(100vh - 140px)",
        paddingRight: 4,
      }}
    >
      <Toolbar
        spec={spec}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />
      <RowEditor row="base" spec={spec} dispatch={dispatch} />
      <RowEditor row="wall" spec={spec} dispatch={dispatch} />
    </div>
  );
}
