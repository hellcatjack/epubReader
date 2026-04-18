import type { TocItem } from "../../lib/types/books";

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

const SECTION_PREFIX_TOKENS = new Set(["book", "books", "chapter", "chapters", "part", "parts", "section", "sections"]);

function matchesTerm(token: string, term: string) {
  return /^\d+$/.test(term) ? token === term : token.startsWith(term);
}

function getLabelSearchVariants(label: string) {
  const labelTokens = tokenize(label);
  if (!labelTokens.length) {
    return [];
  }

  const variants = [labelTokens];
  let prefixLength = 0;

  while (prefixLength < labelTokens.length && SECTION_PREFIX_TOKENS.has(labelTokens[prefixLength] ?? "")) {
    prefixLength += 1;
  }

  if (prefixLength > 0 && prefixLength < labelTokens.length) {
    variants.push(labelTokens.slice(prefixLength));
  }

  return variants;
}

function matchesLabelPrefix(queryTerms: string[], labelVariants: string[][]) {
  return labelVariants.some((variant) =>
    queryTerms.length <= variant.length && queryTerms.every((term, index) => matchesTerm(variant[index] ?? "", term)),
  );
}

function matchesQueryAcrossLineage(lineage: string[], queryTerms: string[], labelIndex = 0, termIndex = 0): boolean {
  if (termIndex >= queryTerms.length) {
    return true;
  }

  if (labelIndex >= lineage.length) {
    return false;
  }

  if (matchesQueryAcrossLineage(lineage, queryTerms, labelIndex + 1, termIndex)) {
    return true;
  }

  const labelVariants = getLabelSearchVariants(lineage[labelIndex] ?? "");
  for (let segmentLength = 1; termIndex + segmentLength <= queryTerms.length; segmentLength += 1) {
    const segment = queryTerms.slice(termIndex, termIndex + segmentLength);
    if (!matchesLabelPrefix(segment, labelVariants)) {
      continue;
    }

    if (matchesQueryAcrossLineage(lineage, queryTerms, labelIndex + 1, termIndex + segmentLength)) {
      return true;
    }
  }

  return false;
}

export function getTocTarget(item: TocItem) {
  return item.target || item.id;
}

export function getTocTargetSpineItemId(item: TocItem) {
  return getTocTarget(item).split("#")[0] ?? "";
}

export function findTocLabelBySpineItemId(items: TocItem[], spineItemId: string): string | undefined {
  for (const item of items) {
    if (getTocTargetSpineItemId(item) === spineItemId) {
      return item.label;
    }

    const nestedLabel = item.children?.length ? findTocLabelBySpineItemId(item.children, spineItemId) : undefined;
    if (nestedLabel) {
      return nestedLabel;
    }
  }

  return undefined;
}

export function findTocPathBySpineItemId(items: TocItem[], spineItemId: string): TocItem[] {
  if (!spineItemId) {
    return [];
  }

  for (const item of items) {
    const nestedPath = item.children?.length ? findTocPathBySpineItemId(item.children, spineItemId) : [];
    if (nestedPath.length) {
      return [item, ...nestedPath];
    }

    if (getTocTargetSpineItemId(item) === spineItemId) {
      return [item];
    }
  }

  return [];
}

export function findTocPathBySectionPath(items: TocItem[], sectionPath: string[]): TocItem[] {
  const normalizedSectionPath = sectionPath.map((label) => label.trim().toLowerCase()).filter(Boolean);
  if (!normalizedSectionPath.length) {
    return [];
  }

  let bestMatch: TocItem[] = [];

  const visit = (entries: TocItem[], ancestors: TocItem[]) => {
    for (const item of entries) {
      const path = [...ancestors, item];
      const normalizedPath = path.map((entry) => entry.label.trim().toLowerCase()).filter(Boolean);
      const pathSuffix = normalizedPath.slice(-normalizedSectionPath.length);

      if (
        pathSuffix.length === normalizedSectionPath.length &&
        pathSuffix.every((label, index) => label === normalizedSectionPath[index]) &&
        path.length > bestMatch.length
      ) {
        bestMatch = path;
      }

      if (item.children?.length) {
        visit(item.children, path);
      }
    }
  };

  visit(items, []);
  return bestMatch;
}

export function findTocPathByTarget(items: TocItem[], target: string): TocItem[] {
  if (!target) {
    return [];
  }

  for (const item of items) {
    const path = item.children?.length ? findTocPathByTarget(item.children, target) : [];
    if (path.length) {
      return [item, ...path];
    }

    if (getTocTarget(item) === target) {
      return [item];
    }
  }

  return [];
}

export function filterTocItems(items: TocItem[], query: string, ancestors: string[] = []): TocItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }
  const queryTerms = tokenize(normalizedQuery);

  return items.flatMap((item) => {
    const lineage = [...ancestors, item.label];
    const matchesSelf = matchesQueryAcrossLineage(lineage, queryTerms);
    const filteredChildren = item.children?.length ? filterTocItems(item.children, normalizedQuery, lineage) : [];

    if (!matchesSelf && !filteredChildren.length) {
      return [];
    }

    return [
      {
        ...item,
        children: filteredChildren,
      },
    ];
  });
}

export function collectExpandableTocIds(items: TocItem[]): string[] {
  return items.flatMap((item) => [
    ...(item.children?.length ? [item.id] : []),
    ...(item.children?.length ? collectExpandableTocIds(item.children) : []),
  ]);
}
