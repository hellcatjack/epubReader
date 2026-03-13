import type { AnnotationRecord } from "../../lib/types/annotations";

export function createAnnotationRenderer() {
  let paintedAnnotations: AnnotationRecord[] = [];

  return {
    clear() {
      paintedAnnotations = [];
    },
    paint(annotations: AnnotationRecord[]) {
      paintedAnnotations = [...annotations];
    },
    snapshot() {
      return paintedAnnotations;
    },
  };
}

export const annotationRenderer = createAnnotationRenderer();
