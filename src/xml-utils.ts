/**
 * Lightweight XML parsing utilities for ADT responses.
 * ADT returns XML heavily — we use regex-based extraction for common patterns
 * to avoid pulling in a full XML parser dependency.
 */

/** Extract all occurrences of a tag's text content */
export function extractTagValues(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>(.*?)</${tagName}>`, "gs");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

/** Extract a single attribute value from the first matching element */
export function extractAttribute(xml: string, tagName: string, attrName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*?\\s${attrName}="([^"]*)"`, "s");
  const match = regex.exec(xml);
  return match ? match[1] : null;
}

/** Extract all elements matching a tag, returning their full XML */
export function extractElements(xml: string, tagName: string): string[] {
  // Handle both self-closing and regular elements
  const regex = new RegExp(`<${tagName}\\b[^>]*(?:/>|>.*?</${tagName}>)`, "gs");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[0]);
  }
  return results;
}

/** Extract multiple attributes from an element as a record */
export function extractAttributes(elementXml: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /(\w[\w:-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(elementXml)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/** Parse ADT error messages from XML error responses */
export function parseAdtError(xml: string): string {
  // ADT errors come as <exc:exception> or <error>
  const msg =
    extractTagValues(xml, "localizedMessage")[0] ??
    extractTagValues(xml, "message")[0] ??
    extractTagValues(xml, "exc:localizedMessage")[0] ??
    xml.substring(0, 500);
  return msg;
}

/** Parse object list from search results */
export function parseSearchResults(xml: string): Array<{ uri: string; type: string; name: string; packageName: string; description: string }> {
  const elements = extractElements(xml, "adtcore:objectReference");
  return elements.map((el) => {
    const attrs = extractAttributes(el);
    return {
      uri: attrs["adtcore:uri"] ?? attrs["uri"] ?? "",
      type: attrs["adtcore:type"] ?? attrs["type"] ?? "",
      name: attrs["adtcore:name"] ?? attrs["name"] ?? "",
      packageName: attrs["adtcore:packageName"] ?? attrs["packageName"] ?? "",
      description: attrs["adtcore:description"] ?? attrs["description"] ?? "",
    };
  });
}
