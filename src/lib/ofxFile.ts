export async function readOfxFile(file: File): Promise<{ content: string; legacyContent: string }> {
  const buffer = await file.arrayBuffer();
  const legacyContent = new TextDecoder('utf-8').decode(buffer);
  const header = new TextDecoder('windows-1252').decode(buffer.slice(0, 2048));
  const declaredCharsets = Array.from(
    header.matchAll(/(?:CHARSET\s*:|encoding\s*=\s*["'])([^"'\s\r\n>]+)/gi),
    (match) => match[1].toLowerCase(),
  );
  const usesWindows1252 = declaredCharsets.some((charset) =>
    charset.includes('1252') || charset.includes('latin1') || charset.includes('latin-1') || charset.includes('8859-1'),
  );

  let content: string;
  if (usesWindows1252) {
    content = new TextDecoder('windows-1252').decode(buffer);
  } else {
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      content = new TextDecoder('windows-1252').decode(buffer);
    }
  }

  return { content, legacyContent };
}