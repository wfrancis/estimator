import { useReducer, useCallback } from "react";
import specReducer from "./specReducer";

const MAX_HISTORY = 50;

function historyReducer(state, action) {
  switch (action.type) {
    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      };
    }

    default: {
      // Forward to specReducer
      const newPresent = specReducer(state.present, action);

      // If specReducer returned the same reference (no-op clone still differs,
      // but LOAD_SPEC with identical data is fine to push), always push history.
      const newPast =
        state.past.length >= MAX_HISTORY
          ? [...state.past.slice(1), state.present]
          : [...state.past, state.present];

      return {
        past: newPast,
        present: newPresent,
        future: [],
      };
    }
  }
}

export default function useSpecState(initialSpec) {
  const [state, rawDispatch] = useReducer(historyReducer, {
    past: [],
    present: initialSpec,
    future: [],
  });

  const dispatch = useCallback((action) => rawDispatch(action), []);
  const undo = useCallback(() => rawDispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => rawDispatch({ type: "REDO" }), []);

  return {
    spec: state.present,
    dispatch,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
