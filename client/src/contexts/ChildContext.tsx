import React, { createContext, useContext, useState, useCallback } from "react";

export type ChildName = "nica" | "nici";

interface ChildContextValue {
  child: ChildName;
  setChild: (child: ChildName) => void;
}

const ChildContext = createContext<ChildContextValue | null>(null);

const STORAGE_KEY = "baby-tracker-child";

export function ChildProvider({ children }: { children: React.ReactNode }) {
  const [child, setChildState] = useState<ChildName>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "nica" || stored === "nici") return stored;
    return "nica";
  });

  const setChild = useCallback((c: ChildName) => {
    setChildState(c);
    localStorage.setItem(STORAGE_KEY, c);
  }, []);

  return (
    <ChildContext.Provider value={{ child, setChild }}>
      {children}
    </ChildContext.Provider>
  );
}

export function useChild() {
  const ctx = useContext(ChildContext);
  if (!ctx) throw new Error("useChild must be used within ChildProvider");
  return ctx;
}
