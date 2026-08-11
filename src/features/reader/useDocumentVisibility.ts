import { useEffect, useState } from "react";

function isDocumentVisible(documentLike: Document | undefined) {
  return !documentLike || documentLike.visibilityState !== "hidden";
}

export function useDocumentVisibility(
  documentLike = typeof document === "undefined" ? undefined : document,
) {
  const [documentVisible, setDocumentVisible] = useState(() => isDocumentVisible(documentLike));

  useEffect(() => {
    if (!documentLike) {
      return undefined;
    }

    const syncVisibility = () => setDocumentVisible(isDocumentVisible(documentLike));
    syncVisibility();
    documentLike.addEventListener("visibilitychange", syncVisibility);

    return () => documentLike.removeEventListener("visibilitychange", syncVisibility);
  }, [documentLike]);

  return documentVisible;
}
