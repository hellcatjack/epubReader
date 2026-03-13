import { strFromU8, unzipSync } from "fflate";

export type ExtractedPackageMetadata = {
  title: string | null;
  author: string | null;
  coverThumbnailBlob: Blob | null;
};

function readArchiveTextFile(archive: Record<string, Uint8Array>, path: string) {
  const entry = archive[path];
  return entry ? strFromU8(entry) : null;
}

function extractOpfPath(containerXml: string) {
  const match = containerXml.match(/full-path="([^"]+)"/i);
  return match?.[1] ?? null;
}

function extractTagValue(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

export async function extractPackageMetadata(file: File): Promise<ExtractedPackageMetadata> {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const containerXml = readArchiveTextFile(archive, "META-INF/container.xml");
  const opfPath = containerXml ? extractOpfPath(containerXml) : null;
  const opfXml = opfPath ? readArchiveTextFile(archive, opfPath) : null;

  return {
    title: opfXml ? extractTagValue(opfXml, "dc:title") : null,
    author: opfXml ? extractTagValue(opfXml, "dc:creator") : null,
    coverThumbnailBlob: null,
  };
}
