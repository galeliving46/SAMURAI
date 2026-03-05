#!/usr/bin/env node
/**
 * SAP ADT MCP Server
 * Exposes SAP ABAP Development Tools via Model Context Protocol for Kiro integration.
 *
 * Tools: search, read, write, activate, lock/unlock, transport, unit test, CDS, syntax check
 * Resources: system info, package structure
 * Transport: stdio
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AdtClient, resolveHost, type AdtConfig } from "./adt-client.js";
import { parseAdtError, parseSearchResults, extractTagValues, extractElements, extractAttributes, extractAttribute } from "./xml-utils.js";

// ─── Configuration from environment ───
// Supports two connection modes:
//   Mode 1 (direct URL):    SAP_HOST=https://myserver:44300
//   Mode 2 (Eclipse-style): SAP_ASHOST=sap-server.example.com  SAP_SYSNR=00  SAP_SID=DEV  [SAP_SSL=false]
function loadConfig(): AdtConfig {
  const username = process.env.SAP_USERNAME;
  const password = process.env.SAP_PASSWORD;
  const client = process.env.SAP_CLIENT ?? "100";
  const language = process.env.SAP_LANGUAGE ?? "EN";

  if (!username || !password) {
    console.error("Required env vars: SAP_USERNAME, SAP_PASSWORD");
    process.exit(1);
  }

  let host: string;
  try {
    host = resolveHost({
      host: process.env.SAP_HOST,
      ashost: process.env.SAP_ASHOST,
      instanceNr: process.env.SAP_SYSNR,
      ssl: process.env.SAP_SSL !== "false",
    });
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }

  const systemId = process.env.SAP_SID;
  console.error(`Connecting to: ${host} (client ${client}${systemId ? `, SID ${systemId}` : ""})`);

  return { host, client, username, password, language, systemId };
}

const config = loadConfig();
const adt = new AdtClient(config);

const server = new McpServer({
  name: "sap-adt",
  version: "1.0.0",
});

// ─── Conflict Detection Helper ───
// Optimistic concurrency: read server source before writing, compare with expected baseline.
// Returns null if safe to proceed, or a conflict message string.
async function checkConflict(
  sourceUri: string,
  expectedSource?: string,
): Promise<string | null> {
  if (!expectedSource) return null; // No baseline provided — skip check (backward compatible)
  const res = await adt.get(sourceUri, "text/plain");
  if (res.status !== 200) return null; // Can't read — proceed anyway, lock will catch issues
  const serverSource = res.body.replace(/\r\n/g, "\n").trimEnd();
  const expected = expectedSource.replace(/\r\n/g, "\n").trimEnd();
  if (serverSource === expected) return null;
  // Build a useful diff summary
  const serverLines = serverSource.split("\n");
  const expectedLines = expected.split("\n");
  const diffLines: string[] = [];
  const maxCheck = Math.max(serverLines.length, expectedLines.length);
  for (let i = 0; i < maxCheck && diffLines.length < 5; i++) {
    if (serverLines[i] !== expectedLines[i]) {
      diffLines.push(`  Line ${i + 1}: server="${(serverLines[i] ?? "").substring(0, 80)}" vs expected="${(expectedLines[i] ?? "").substring(0, 80)}"`);
    }
  }
  return `CONFLICT DETECTED: Server source differs from your baseline. Someone else may have changed this object.\n\nFirst differences:\n${diffLines.join("\n")}\n\nTo proceed, re-read the server source (read_object_source), review the differences, and retry with the updated expectedSource — or omit expectedSource to force-write.`;
}

// ═══════════════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════════════

// ─── Connection Test ───
server.tool(
  "test_connection",
  "Test connectivity to the SAP system via ADT discovery endpoint",
  {},
  async () => {
    const ok = await adt.testConnection();
    return {
      content: [{ type: "text", text: ok ? `Connected to ${config.host} (client ${config.client})` : `Connection FAILED to ${config.host}` }],
    };
  },
);

// ─── Object Search ───
server.tool(
  "search_objects",
  "Search for ABAP objects (classes, interfaces, programs, function groups, CDS views, etc.) by name pattern",
  {
    query: z.string().describe("Search term, supports wildcards (*). E.g. 'ZCL_MY*' or '*SALES_ORDER*'"),
    objectType: z.string().optional().describe("ADT object type filter. E.g. CLAS/OC (class), INTF/OI (interface), PROG/P (program), DDLS/DF (CDS view), FUGR/F (function group), TABL/DT (table), DTEL/DE (data element)"),
    maxResults: z.number().optional().default(50).describe("Max results to return"),
  },
  async ({ query, objectType, maxResults }) => {
    let path = `/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    if (objectType) path += `&objectType=${encodeURIComponent(objectType)}`;

    const res = await adt.get(path);
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Search failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }

    const results = parseSearchResults(res.body);
    if (results.length === 0) {
      return { content: [{ type: "text", text: "No objects found." }] };
    }

    const formatted = results.map((r) => `${r.type} | ${r.name} | ${r.packageName} | ${r.uri}`).join("\n");
    return { content: [{ type: "text", text: `Found ${results.length} objects:\n\nType | Name | Package | URI\n${formatted}` }] };
  },
);

// ─── Read ABAP Source ───
server.tool(
  "read_object_source",
  "Read the ABAP source code of an object (class, interface, program, include, function module). Returns the full source text.",
  {
    objectUri: z.string().describe("ADT URI of the object. E.g. /sap/bc/adt/oo/classes/zcl_my_class/source/main"),
  },
  async ({ objectUri }) => {
    const res = await adt.get(objectUri, "text/plain");
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

// ─── Read Object Structure (class methods, includes, etc.) ───
server.tool(
  "read_object_structure",
  "Read the structure/metadata of an ABAP object (class components, program includes, etc.)",
  {
    objectUri: z.string().describe("ADT URI of the object. E.g. /sap/bc/adt/oo/classes/zcl_my_class"),
  },
  async ({ objectUri }) => {
    const res = await adt.get(objectUri, "application/xml");
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

// ─── Write ABAP Source ───
server.tool(
  "write_object_source",
  "Write/update the ABAP source code of an object. Handles lock/unlock automatically. Provide the FULL source — this is a complete replacement. Pass expectedSource (the server source you based your changes on) to enable conflict detection.",
  {
    objectUri: z.string().describe("ADT URI for the source. E.g. /sap/bc/adt/oo/classes/zcl_my_class/source/main"),
    source: z.string().describe("Complete ABAP source code to write"),
    lockUri: z.string().optional().describe("Lock URI if different from source URI. For classes, use the class URI without /source/main"),
    expectedSource: z.string().optional().describe("The server source you based your changes on. If provided, the tool checks for conflicts before writing. If the server source has changed since you read it, the write is aborted with a conflict message."),
  },
  async ({ objectUri, source, lockUri, expectedSource }) => {
    // Optimistic concurrency check
    const conflict = await checkConflict(objectUri, expectedSource);
    if (conflict) {
      return { content: [{ type: "text", text: conflict }] };
    }

    const lockTarget = lockUri ?? objectUri.replace(/\/source\/.*$/, "");
    let lockHandle: string;
    try {
      lockHandle = await adt.lockObject(lockTarget);
    } catch (e: any) {
      return { content: [{ type: "text", text: `Lock failed: ${e.message}` }] };
    }

    try {
      const res = await adt.put(objectUri, source, "text/plain", lockHandle);
      if (res.status !== 200 && res.status !== 204) {
        return { content: [{ type: "text", text: `Write failed (${res.status}): ${parseAdtError(res.body)}` }] };
      }
      return { content: [{ type: "text", text: `Source written successfully to ${objectUri}` }] };
    } finally {
      await adt.unlockObject(lockTarget, lockHandle).catch(() => {});
    }
  },
);

// ─── Activate Objects ───
server.tool(
  "activate_objects",
  "Activate one or more ABAP objects (syntax check + generation). Equivalent to Ctrl+F3 in ADT.",
  {
    objectUris: z.array(z.string()).describe("Array of ADT URIs to activate. E.g. ['/sap/bc/adt/oo/classes/zcl_my_class']"),
  },
  async ({ objectUris }) => {
    const res = await adt.activate(objectUris);
    if (res.status === 200 || res.status === 204) {
      // Check for warnings/errors in response
      const messages = extractTagValues(res.body, "msg:shortText");
      if (messages.length > 0) {
        return { content: [{ type: "text", text: `Activation completed with messages:\n${messages.join("\n")}` }] };
      }
      return { content: [{ type: "text", text: `Activated ${objectUris.length} object(s) successfully.` }] };
    }
    return { content: [{ type: "text", text: `Activation failed (${res.status}): ${parseAdtError(res.body)}` }] };
  },
);

// ─── Syntax Check ───
server.tool(
  "check_syntax",
  "Run syntax check (ABAP check) on an object without activating it",
  {
    objectUri: z.string().describe("ADT URI of the object to check. E.g. /sap/bc/adt/oo/classes/zcl_my_class"),
  },
  async ({ objectUri }) => {
    const checkUri = `/sap/bc/adt/checkruns?reporters=abapCheckRun`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">
  <chkrun:checkObject adtcore:uri="${objectUri}"/>
</chkrun:checkObjectList>`;

    const res = await adt.post(checkUri, xml, "application/xml");
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Check failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }

    const findings = extractElements(res.body, "chkrun:checkMessage");
    if (findings.length === 0) {
      return { content: [{ type: "text", text: "Syntax check passed — no issues found." }] };
    }

    const messages = findings.map((f) => {
      const attrs = extractAttributes(f);
      return `[${attrs["chkrun:type"] ?? "?"}] Line ${attrs["chkrun:line"] ?? "?"}: ${attrs["chkrun:shortText"] ?? extractTagValues(f, "chkrun:shortText")[0] ?? ""}`;
    });
    return { content: [{ type: "text", text: `Syntax check found ${findings.length} issue(s):\n${messages.join("\n")}` }] };
  },
);

// ─── Run ABAP Unit Tests ───
server.tool(
  "run_unit_tests",
  "Execute ABAP Unit tests for a class, program, or package. Returns test results with pass/fail details.",
  {
    objectUri: z.string().describe("ADT URI of the object to test. E.g. /sap/bc/adt/oo/classes/zcl_my_class"),
  },
  async ({ objectUri }) => {
    // Launch test run
    const runXml = `<?xml version="1.0" encoding="UTF-8"?>
<aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit">
  <external>
    <coverage active="false"/>
  </external>
  <options>
    <uriType value="semantic"/>
    <testDeterminationStrategy sameProgram="true" assignedTests="false" publicTestClasses="true"/>
    <testRiskLevels harmless="true" dangerous="true" critical="true"/>
    <testDurations short="true" medium="true" long="true"/>
  </options>
  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
        <adtcore:objectReference adtcore:uri="${objectUri}"/>
      </adtcore:objectReferences>
    </objectSet>
  </adtcore:objectSets>
</aunit:runConfiguration>`;

    const res = await adt.post("/sap/bc/adt/abapunit/testruns", runXml, "application/xml");
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Unit test run failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }

    // Parse results
    const alerts = extractElements(res.body, "aunit:alert");
    const testMethods = extractElements(res.body, "aunit:testMethod");

    if (testMethods.length === 0 && alerts.length === 0) {
      return { content: [{ type: "text", text: "No ABAP Unit tests found for this object." }] };
    }

    const results: string[] = [];
    for (const tm of testMethods) {
      const attrs = extractAttributes(tm);
      const name = attrs["aunit:name"] ?? "unknown";
      const duration = attrs["executionTime"] ?? "";
      const methodAlerts = extractElements(tm, "aunit:alert");
      if (methodAlerts.length === 0) {
        results.push(`✅ ${name} (${duration}ms)`);
      } else {
        for (const a of methodAlerts) {
          const aAttrs = extractAttributes(a);
          const severity = aAttrs["aunit:severity"] ?? aAttrs["severity"] ?? "error";
          const details = extractTagValues(a, "aunit:details").join(" | ") || extractTagValues(a, "details").join(" | ");
          results.push(`❌ ${name} [${severity}]: ${details} (${duration}ms)`);
        }
      }
    }

    // Global alerts (e.g., runtime errors)
    for (const a of alerts) {
      if (!testMethods.some((tm) => tm.includes(a))) {
        const title = extractTagValues(a, "aunit:title")[0] ?? "";
        const details = extractTagValues(a, "aunit:details")[0] ?? "";
        results.push(`⚠️ ${title}: ${details}`);
      }
    }

    return { content: [{ type: "text", text: `ABAP Unit Results (${testMethods.length} test methods):\n\n${results.join("\n")}` }] };
  },
);

// ─── Transport Management ───
server.tool(
  "list_transports",
  "List open transport requests for the current user",
  {
    user: z.string().optional().describe("SAP username. Defaults to the configured user."),
    targetSystem: z.string().optional().describe("Filter by target system (e.g. 'QAS')"),
  },
  async ({ user, targetSystem }) => {
    const owner = user ?? config.username.toUpperCase();
    let path = `/sap/bc/adt/cts/transportrequests?user=${encodeURIComponent(owner)}&status=D`; // D = modifiable
    if (targetSystem) path += `&target=${encodeURIComponent(targetSystem)}`;

    const res = await adt.get(path, "application/xml");
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }

    const requests = extractElements(res.body, "tm:request");
    if (requests.length === 0) {
      return { content: [{ type: "text", text: "No open transport requests found." }] };
    }

    const formatted = requests.map((r) => {
      const attrs = extractAttributes(r);
      return `${attrs["tm:number"] ?? "?"} | ${attrs["tm:owner"] ?? "?"} | ${attrs["tm:desc"] ?? attrs["tm:description"] ?? ""} | Target: ${attrs["tm:target"] ?? "?"}`;
    });
    return { content: [{ type: "text", text: `Open transports:\n\nNumber | Owner | Description | Target\n${formatted.join("\n")}` }] };
  },
);

server.tool(
  "release_transport",
  "Release a transport request or task",
  {
    transportNumber: z.string().describe("Transport number, e.g. 'DEVK900123'"),
  },
  async ({ transportNumber }) => {
    const res = await adt.post(
      `/sap/bc/adt/cts/transportrequests/${encodeURIComponent(transportNumber)}/newreleasejobs`,
    );
    if (res.status === 200 || res.status === 201 || res.status === 204) {
      return { content: [{ type: "text", text: `Transport ${transportNumber} released successfully.` }] };
    }
    return { content: [{ type: "text", text: `Release failed (${res.status}): ${parseAdtError(res.body)}` }] };
  },
);

// ─── Create ABAP Object ───
server.tool(
  "create_class",
  "Create a new ABAP OO class in the system",
  {
    name: z.string().describe("Class name, e.g. 'ZCL_MY_NEW_CLASS'"),
    description: z.string().describe("Short description"),
    packageName: z.string().describe("Package to assign, e.g. 'ZMY_PACKAGE'"),
    transportNumber: z.string().describe("Transport request number, e.g. 'DEVK900123'"),
    superClass: z.string().optional().describe("Super class name if inheriting"),
    interfaces: z.array(z.string()).optional().describe("Interfaces to implement"),
  },
  async ({ name, description, packageName, transportNumber, superClass, interfaces }) => {
    const superClassXml = superClass
      ? `<class:superClass class:name="${superClass}"/>`
      : "";
    const interfacesXml = interfaces?.length
      ? `<class:implementedInterfaces>${interfaces.map((i) => `<class:implementedInterface class:name="${i}"/>`).join("")}</class:implementedInterfaces>`
      : "";

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${description}"
  adtcore:language="EN"
  adtcore:name="${name.toUpperCase()}"
  adtcore:type="CLAS/OC"
  class:final="true"
  class:visibility="public">
  <adtcore:packageRef adtcore:name="${packageName.toUpperCase()}"/>
  ${superClassXml}
  ${interfacesXml}
</class:abapClass>`;

    const res = await adt.post(
      `/sap/bc/adt/oo/classes?corrNr=${encodeURIComponent(transportNumber)}`,
      xml,
      "application/xml",
    );

    if (res.status === 201) {
      const location = res.headers.get("Location") ?? `/sap/bc/adt/oo/classes/${name.toLowerCase()}`;
      return { content: [{ type: "text", text: `Class ${name} created. URI: ${location}` }] };
    }
    return { content: [{ type: "text", text: `Create failed (${res.status}): ${parseAdtError(res.body)}` }] };
  },
);

server.tool(
  "create_interface",
  "Create a new ABAP interface",
  {
    name: z.string().describe("Interface name, e.g. 'ZIF_MY_INTERFACE'"),
    description: z.string().describe("Short description"),
    packageName: z.string().describe("Package name"),
    transportNumber: z.string().describe("Transport request number"),
  },
  async ({ name, description, packageName, transportNumber }) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<intf:abapInterface xmlns:intf="http://www.sap.com/adt/oo/interfaces"
  xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:description="${description}"
  adtcore:language="EN"
  adtcore:name="${name.toUpperCase()}"
  adtcore:type="INTF/OI">
  <adtcore:packageRef adtcore:name="${packageName.toUpperCase()}"/>
</intf:abapInterface>`;

    const res = await adt.post(
      `/sap/bc/adt/oo/interfaces?corrNr=${encodeURIComponent(transportNumber)}`,
      xml,
      "application/xml",
    );

    if (res.status === 201) {
      return { content: [{ type: "text", text: `Interface ${name} created.` }] };
    }
    return { content: [{ type: "text", text: `Create failed (${res.status}): ${parseAdtError(res.body)}` }] };
  },
);

// ─── CDS View Source ───
server.tool(
  "read_cds_source",
  "Read the source of a CDS view (Data Definition Language source)",
  {
    cdsName: z.string().describe("CDS view name, e.g. 'Z_I_SALESORDER'"),
  },
  async ({ cdsName }) => {
    const res = await adt.get(
      `/sap/bc/adt/ddic/ddl/sources/${encodeURIComponent(cdsName.toLowerCase())}/source/main`,
      "text/plain",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

server.tool(
  "write_cds_source",
  "Write/update CDS view source. Handles lock/unlock. Provide the FULL DDL source. Pass expectedSource for conflict detection.",
  {
    cdsName: z.string().describe("CDS view name"),
    source: z.string().describe("Complete DDL source code"),
    expectedSource: z.string().optional().describe("The server source you based your changes on — enables conflict detection."),
  },
  async ({ cdsName, source, expectedSource }) => {
    const basePath = `/sap/bc/adt/ddic/ddl/sources/${encodeURIComponent(cdsName.toLowerCase())}`;
    const conflict = await checkConflict(`${basePath}/source/main`, expectedSource);
    if (conflict) {
      return { content: [{ type: "text", text: conflict }] };
    }

    let lockHandle: string;
    try {
      lockHandle = await adt.lockObject(basePath);
    } catch (e: any) {
      return { content: [{ type: "text", text: `Lock failed: ${e.message}` }] };
    }

    try {
      const res = await adt.put(`${basePath}/source/main`, source, "text/plain", lockHandle);
      if (res.status !== 200 && res.status !== 204) {
        return { content: [{ type: "text", text: `Write failed (${res.status}): ${parseAdtError(res.body)}` }] };
      }
      return { content: [{ type: "text", text: `CDS source written for ${cdsName}` }] };
    } finally {
      await adt.unlockObject(basePath, lockHandle).catch(() => {});
    }
  },
);

// ─── Package Contents ───
server.tool(
  "list_package_contents",
  "List all objects in an ABAP package (development package / software component)",
  {
    packageName: z.string().describe("Package name, e.g. 'ZMY_PACKAGE'"),
  },
  async ({ packageName }) => {
    const res = await adt.get(
      `/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=*&objectType=&packageName=${encodeURIComponent(packageName.toUpperCase())}&maxResults=200`,
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }

    const results = parseSearchResults(res.body);
    if (results.length === 0) {
      return { content: [{ type: "text", text: `Package ${packageName} is empty or not found.` }] };
    }

    const formatted = results.map((r) => `${r.type} | ${r.name} | ${r.description}`).join("\n");
    return { content: [{ type: "text", text: `Package ${packageName} (${results.length} objects):\n\nType | Name | Description\n${formatted}` }] };
  },
);

// ─── Read Table Definition ───
server.tool(
  "read_table_definition",
  "Read the definition/structure of a database table or structure from DDIC",
  {
    tableName: z.string().describe("Table or structure name, e.g. 'MARA' or 'ZTMY_TABLE'"),
  },
  async ({ tableName }) => {
    const res = await adt.get(
      `/sap/bc/adt/ddic/tables/${encodeURIComponent(tableName.toLowerCase())}`,
      "application/xml",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

// ─── Read Data Element ───
server.tool(
  "read_data_element",
  "Read a data element definition from DDIC",
  {
    dataElementName: z.string().describe("Data element name, e.g. 'MATNR'"),
  },
  async ({ dataElementName }) => {
    const res = await adt.get(
      `/sap/bc/adt/ddic/dataelements/${encodeURIComponent(dataElementName.toLowerCase())}`,
      "application/xml",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

// ─── Code Completion / Content Assist ───
server.tool(
  "get_code_completion",
  "Get ABAP code completion suggestions at a specific position in source code",
  {
    objectUri: z.string().describe("ADT URI of the source, e.g. /sap/bc/adt/oo/classes/zcl_my_class/source/main"),
    line: z.number().describe("Line number (1-based)"),
    column: z.number().describe("Column number (0-based)"),
  },
  async ({ objectUri, line, column }) => {
    const res = await adt.post(
      `${objectUri}?operation=codeCompletion&row=${line}&column=${column}`,
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Completion failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

// ─── Where-Used List ───
server.tool(
  "where_used",
  "Find all usages/references of an ABAP object (where-used list)",
  {
    objectUri: z.string().describe("ADT URI of the object to search references for"),
  },
  async ({ objectUri }) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">
  <adtcore:objectReference xmlns:adtcore="http://www.sap.com/adt/core" adtcore:uri="${objectUri}"/>
</usagereferences:usageReferenceRequest>`;

    const res = await adt.post(
      "/sap/bc/adt/repository/informationsystem/usageReferences",
      xml,
      "application/xml",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Where-used failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }

    const refs = extractElements(res.body, "adtcore:objectReference");
    if (refs.length === 0) {
      return { content: [{ type: "text", text: "No usages found." }] };
    }

    const formatted = refs.map((r) => {
      const attrs = extractAttributes(r);
      return `${attrs["adtcore:type"] ?? ""} | ${attrs["adtcore:name"] ?? ""} | ${attrs["adtcore:uri"] ?? ""}`;
    });
    return { content: [{ type: "text", text: `Found ${refs.length} usage(s):\n\nType | Name | URI\n${formatted.join("\n")}` }] };
  },
);

// ─── ATC (ABAP Test Cockpit) Check ───
server.tool(
  "run_atc_check",
  "Run ATC (ABAP Test Cockpit) checks on an object — code inspector, custom checks, etc.",
  {
    objectUri: z.string().describe("ADT URI of the object to check"),
    checkVariant: z.string().optional().default("DEFAULT").describe("ATC check variant name"),
  },
  async ({ objectUri, checkVariant }) => {
    // Create ATC run
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<atc:run xmlns:atc="http://www.sap.com/adt/atc" maximumVerdicts="100">
  <objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
        <adtcore:objectReference adtcore:uri="${objectUri}"/>
      </adtcore:objectReferences>
    </objectSet>
  </objectSets>
</atc:run>`;

    const runRes = await adt.post(
      `/sap/bc/adt/atc/runs?checkVariant=${encodeURIComponent(checkVariant)}`,
      xml,
      "application/xml",
    );

    if (runRes.status !== 200 && runRes.status !== 201) {
      return { content: [{ type: "text", text: `ATC run failed (${runRes.status}): ${parseAdtError(runRes.body)}` }] };
    }

    // Extract run ID and fetch results
    const runId = extractAttribute(runRes.body, "atc:run", "atc:id") ??
      extractAttribute(runRes.body, "run", "id");

    if (!runId) {
      // Results might be inline
      return { content: [{ type: "text", text: runRes.body }] };
    }

    const resultRes = await adt.get(`/sap/bc/adt/atc/runs/${runId}/results`);
    if (resultRes.status !== 200) {
      return { content: [{ type: "text", text: `ATC results fetch failed (${resultRes.status}): ${parseAdtError(resultRes.body)}` }] };
    }

    return { content: [{ type: "text", text: resultRes.body }] };
  },
);

// ─── Behavior Definition (RAP) ───
server.tool(
  "read_behavior_definition",
  "Read a RAP behavior definition source",
  {
    behaviorName: z.string().describe("Behavior definition name (matches CDS root entity)"),
  },
  async ({ behaviorName }) => {
    const res = await adt.get(
      `/sap/bc/adt/bo/behaviordefinitions/${encodeURIComponent(behaviorName.toLowerCase())}/source/main`,
      "text/plain",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

server.tool(
  "write_behavior_definition",
  "Write/update a RAP behavior definition source. Handles lock/unlock. Pass expectedSource for conflict detection.",
  {
    behaviorName: z.string().describe("Behavior definition name"),
    source: z.string().describe("Complete behavior definition source"),
    expectedSource: z.string().optional().describe("The server source you based your changes on — enables conflict detection."),
  },
  async ({ behaviorName, source, expectedSource }) => {
    const basePath = `/sap/bc/adt/bo/behaviordefinitions/${encodeURIComponent(behaviorName.toLowerCase())}`;
    const conflict = await checkConflict(`${basePath}/source/main`, expectedSource);
    if (conflict) {
      return { content: [{ type: "text", text: conflict }] };
    }

    let lockHandle: string;
    try {
      lockHandle = await adt.lockObject(basePath);
    } catch (e: any) {
      return { content: [{ type: "text", text: `Lock failed: ${e.message}` }] };
    }

    try {
      const res = await adt.put(`${basePath}/source/main`, source, "text/plain", lockHandle);
      if (res.status !== 200 && res.status !== 204) {
        return { content: [{ type: "text", text: `Write failed (${res.status}): ${parseAdtError(res.body)}` }] };
      }
      return { content: [{ type: "text", text: `Behavior definition written for ${behaviorName}` }] };
    } finally {
      await adt.unlockObject(basePath, lockHandle).catch(() => {});
    }
  },
);

// ─── Service Binding ───
server.tool(
  "read_service_binding",
  "Read a service binding definition (OData V2/V4)",
  {
    bindingName: z.string().describe("Service binding name"),
  },
  async ({ bindingName }) => {
    const res = await adt.get(
      `/sap/bc/adt/businessservices/bindings/${encodeURIComponent(bindingName.toLowerCase())}`,
      "application/xml",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

// ─── Function Module ───
server.tool(
  "read_function_module",
  "Read a function module source and its interface (importing/exporting/changing/tables parameters)",
  {
    functionGroup: z.string().describe("Function group name"),
    functionModule: z.string().describe("Function module name"),
  },
  async ({ functionGroup, functionModule }) => {
    const res = await adt.get(
      `/sap/bc/adt/functions/groups/${encodeURIComponent(functionGroup.toLowerCase())}/fmodules/${encodeURIComponent(functionModule.toLowerCase())}/source/main`,
      "text/plain",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

// ─── Program / Report ───
server.tool(
  "read_program",
  "Read an ABAP program/report source",
  {
    programName: z.string().describe("Program name, e.g. 'ZMY_REPORT'"),
  },
  async ({ programName }) => {
    const res = await adt.get(
      `/sap/bc/adt/programs/programs/${encodeURIComponent(programName.toLowerCase())}/source/main`,
      "text/plain",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

server.tool(
  "write_program",
  "Write/update an ABAP program source. Handles lock/unlock. Pass expectedSource for conflict detection.",
  {
    programName: z.string().describe("Program name"),
    source: z.string().describe("Complete program source"),
    expectedSource: z.string().optional().describe("The server source you based your changes on — enables conflict detection."),
  },
  async ({ programName, source, expectedSource }) => {
    const basePath = `/sap/bc/adt/programs/programs/${encodeURIComponent(programName.toLowerCase())}`;
    const conflict = await checkConflict(`${basePath}/source/main`, expectedSource);
    if (conflict) {
      return { content: [{ type: "text", text: conflict }] };
    }

    let lockHandle: string;
    try {
      lockHandle = await adt.lockObject(basePath);
    } catch (e: any) {
      return { content: [{ type: "text", text: `Lock failed: ${e.message}` }] };
    }

    try {
      const res = await adt.put(`${basePath}/source/main`, source, "text/plain", lockHandle);
      if (res.status !== 200 && res.status !== 204) {
        return { content: [{ type: "text", text: `Write failed (${res.status}): ${parseAdtError(res.body)}` }] };
      }
      return { content: [{ type: "text", text: `Program source written for ${programName}` }] };
    } finally {
      await adt.unlockObject(basePath, lockHandle).catch(() => {});
    }
  },
);

// ─── Access Control (DCL) ───
server.tool(
  "read_access_control",
  "Read a CDS access control (DCL) source",
  {
    accessControlName: z.string().describe("Access control name, typically matches the CDS view name"),
  },
  async ({ accessControlName }) => {
    const res = await adt.get(
      `/sap/bc/adt/acm/dcl/sources/${encodeURIComponent(accessControlName.toLowerCase())}/source/main`,
      "text/plain",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

// ─── Metadata Extension ───
server.tool(
  "read_metadata_extension",
  "Read a CDS metadata extension source (UI annotations, etc.)",
  {
    extensionName: z.string().describe("Metadata extension name"),
  },
  async ({ extensionName }) => {
    const res = await adt.get(
      `/sap/bc/adt/ddic/ddlx/sources/${encodeURIComponent(extensionName.toLowerCase())}/source/main`,
      "text/plain",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

// ─── AMDP (ABAP Managed Database Procedures) ───
server.tool(
  "read_class_includes",
  "Read specific class includes (local types, test classes, macros). Useful for AMDP implementations and local test classes.",
  {
    className: z.string().describe("Class name, e.g. 'ZCL_MY_CLASS'"),
    includeType: z.enum(["definitions", "implementations", "testclasses", "macros"]).describe("Include type to read"),
  },
  async ({ className, includeType }) => {
    const includeMap: Record<string, string> = {
      definitions: "locals_def",
      implementations: "locals_imp",
      testclasses: "testclasses",
      macros: "macros",
    };
    const res = await adt.get(
      `/sap/bc/adt/oo/classes/${encodeURIComponent(className.toLowerCase())}/includes/${includeMap[includeType]}`,
      "text/plain",
    );
    if (res.status !== 200) {
      return { content: [{ type: "text", text: `Read failed (${res.status}): ${parseAdtError(res.body)}` }] };
    }
    return { content: [{ type: "text", text: res.body }] };
  },
);

server.tool(
  "write_class_include",
  "Write a class include (local types, test classes, etc.). Handles lock/unlock. Pass expectedSource for conflict detection.",
  {
    className: z.string().describe("Class name"),
    includeType: z.enum(["definitions", "implementations", "testclasses", "macros"]).describe("Include type"),
    source: z.string().describe("Complete include source"),
    expectedSource: z.string().optional().describe("The server source you based your changes on — enables conflict detection."),
  },
  async ({ className, includeType, source, expectedSource }) => {
    const includeMap: Record<string, string> = {
      definitions: "locals_def",
      implementations: "locals_imp",
      testclasses: "testclasses",
      macros: "macros",
    };
    const basePath = `/sap/bc/adt/oo/classes/${encodeURIComponent(className.toLowerCase())}`;
    const includePath = `${basePath}/includes/${includeMap[includeType]}`;
    const conflict = await checkConflict(includePath, expectedSource);
    if (conflict) {
      return { content: [{ type: "text", text: conflict }] };
    }

    let lockHandle: string;
    try {
      lockHandle = await adt.lockObject(basePath);
    } catch (e: any) {
      return { content: [{ type: "text", text: `Lock failed: ${e.message}` }] };
    }

    try {
      const res = await adt.put(includePath, source, "text/plain", lockHandle);
      if (res.status !== 200 && res.status !== 204) {
        return { content: [{ type: "text", text: `Write failed (${res.status}): ${parseAdtError(res.body)}` }] };
      }
      return { content: [{ type: "text", text: `Class include (${includeType}) written for ${className}` }] };
    } finally {
      await adt.unlockObject(basePath, lockHandle).catch(() => {});
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// RESOURCES
// ═══════════════════════════════════════════════════════════════════

server.resource(
  "system-info",
  "sap://system/info",
  { description: "SAP system connection info (host, client, language)" },
  async () => ({
    contents: [{
      uri: "sap://system/info",
      text: JSON.stringify({
        host: config.host,
        client: config.client,
        systemId: config.systemId ?? "N/A",
        language: config.language ?? "EN",
        user: config.username,
      }, null, 2),
      mimeType: "application/json",
    }],
  }),
);

// ═══════════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════════

server.prompt(
  "create-rap-bo",
  "Generate a complete RAP Business Object scaffold (CDS, behavior def, handler class)",
  {
    entityName: z.string().describe("Root entity name, e.g. 'SalesOrder'"),
    namespace: z.string().optional().default("Z").describe("Namespace prefix"),
    scenario: z.enum(["managed", "unmanaged", "managed_with_draft"]).optional().default("managed").describe("RAP scenario type"),
  },
  async ({ entityName, namespace, scenario }) => {
    const ns = namespace.toUpperCase();
    const entity = entityName.toUpperCase();
    const draftSection = scenario === "managed_with_draft"
      ? `with draft;\n\ndraft table ${ns}D_${entity}`
      : "";
    const scenarioKeyword = scenario === "managed_with_draft" ? "managed" : scenario;

    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Create a complete RAP Business Object for entity "${entity}" with namespace "${ns}".

Scenario: ${scenarioKeyword} ${scenario === "managed_with_draft" ? "with draft" : ""}

Generate the following artifacts:
1. CDS Interface View: ${ns}_I_${entity} (root entity with key fields, associations, annotations)
2. CDS Consumption View: ${ns}_C_${entity} (with UI annotations for Fiori Elements)
3. Behavior Definition: ${ns}_I_${entity} (${scenarioKeyword} implementation, ${draftSection ? "with draft, " : ""}standard operations create/update/delete, validations, determinations)
4. Behavior Implementation Class: ZCL_BP_I_${entity} (handler + saver if unmanaged)
5. Service Definition: ${ns}_SD_${entity}
6. Service Binding: ${ns}_UI_${entity}_O4 (OData V4 UI binding)
${scenario === "managed_with_draft" ? `7. Draft Table: ${ns}D_${entity}` : ""}

Follow clean ABAP conventions. Include proper annotations (@AbapCatalog, @AccessControl, @Metadata, @UI, @Search).
Use ABAP Doc comments. Design for testability.`,
        },
      }],
    };
  },
);

server.prompt(
  "review-abap-code",
  "Review ABAP code for clean code violations, performance issues, and security gaps",
  {
    objectUri: z.string().describe("ADT URI of the object to review"),
  },
  async ({ objectUri }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Read the ABAP source at ${objectUri} and perform a thorough code review. Check for:

1. Clean ABAP violations (SAP style guide)
2. Performance issues (N+1 SELECTs, missing indexes, unnecessary DB access in loops)
3. Security gaps (missing authority checks, SQL injection via dynamic WHERE, hardcoded credentials)
4. Error handling (missing TRY/CATCH, overly broad CATCH cx_root)
5. Testability (tight coupling, missing DI, untestable static calls)
6. RAP-specific issues if applicable (incorrect determination/validation timing, missing feature control)
7. Naming convention violations
8. Missing ABAP Doc comments on public APIs

Provide specific line references and concrete fix suggestions.`,
      },
    }],
  }),
);

// ═══════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SAP ADT MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
