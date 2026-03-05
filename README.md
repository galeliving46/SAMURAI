# SAP ADT MCP Server

An MCP (Model Context Protocol) server that gives AI agents direct access to SAP systems via ADT REST APIs. Enables reading, writing, activating, testing, and managing ABAP objects — all from your IDE's AI assistant.

Works with Kiro, Claude Desktop, or any MCP-compatible client.

---

## Features

- **30 tools** covering the full ABAP development lifecycle
- **2 prompt templates** for RAP scaffolding and code review
- **System info resource** for connection context
- **Automatic CSRF token management** for write operations
- **Lock/unlock handling** built into all write tools
- **Eclipse-style connection** support (ashost + instance number)
- **Pre-built Kiro hooks** for safety and workflow automation

---

## Setup

### 1. Build

```bash
cd sap-adt-mcp-server
npm install
npm run build
```

### 2. Configure


#### Kiro

Create or edit `.kiro/settings/mcp.json` in your workspace root:

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["sap-adt-mcp-server/dist/index.js"],
      "env": {
        "SAP_HOST": "http://sap-server.example.com:8000",
        "SAP_CLIENT": "100",
        "SAP_USERNAME": "DEVELOPER",
        "SAP_PASSWORD": "your-password",
        "SAP_LANGUAGE": "EN"
      },
      "disabled": false,
      "autoApprove": [
        "test_connection",
        "search_objects",
        "read_object_source",
        "read_object_structure",
        "read_cds_source",
        "read_behavior_definition",
        "read_service_binding",
        "read_function_module",
        "read_program",
        "read_table_definition",
        "read_data_element",
        "read_access_control",
        "read_metadata_extension",
        "read_class_includes",
        "list_package_contents",
        "list_transports",
        "where_used",
        "check_syntax",
        "get_code_completion"
      ]
    }
  }
}
```

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["/absolute/path/to/sap-adt-mcp-server/dist/index.js"],
      "env": {
        "SAP_HOST": "http://sap-server.example.com:8000",
        "SAP_CLIENT": "100",
        "SAP_USERNAME": "DEVELOPER",
        "SAP_PASSWORD": "your-password",
        "SAP_LANGUAGE": "EN"
      }
    }
  }
}
```

### 3. Connection Modes

The server supports two connection modes, matching Eclipse ADT:

**Mode 1 — Direct URL:**

```
SAP_HOST=http://sap-server.example.com:8000
```

**Mode 2 — Eclipse-style (application server + instance number):**

```
SAP_ASHOST=sap-server.example.com
SAP_SYSNR=00
SAP_SSL=true
SAP_SID=S4H
```

Eclipse-style auto-constructs the URL: HTTPS → `https://host:443<nn>`, HTTP → `http://host:80<nn>`

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SAP_HOST` | Yes* | Full SAP system URL | `http://server:8000` |
| `SAP_ASHOST` | Yes* | Application server hostname | `sap-server.example.com` |
| `SAP_SYSNR` | Yes* | Instance number | `00` |
| `SAP_SSL` | No | Use HTTPS (default: `true`) | `false` |
| `SAP_SID` | No | System ID (informational) | `S4H` |
| `SAP_CLIENT` | No | SAP client (default: `100`) | `100` |
| `SAP_USERNAME` | Yes | SAP user | `DEVELOPER` |
| `SAP_PASSWORD` | Yes | SAP password | — |
| `SAP_LANGUAGE` | No | Logon language (default: `EN`) | `EN` |

*Provide either `SAP_HOST` or `SAP_ASHOST` + `SAP_SYSNR`.

---

## Tools Reference (30 tools)

### System

| Tool | Description |
|------|-------------|
| `test_connection` | Test connectivity to SAP via ADT discovery endpoint |

### Search & Navigation

| Tool | Parameters | Description |
|------|-----------|-------------|
| `search_objects` | `query`, `objectType?`, `maxResults?` | Search ABAP objects by name pattern (wildcards supported) |
| `where_used` | `objectUri` | Find all references to an object (where-used list) |
| `list_package_contents` | `packageName` | List all objects in a development package |
| `get_code_completion` | `objectUri`, `line`, `column` | Get code completion suggestions at a position |

### Read Operations

| Tool | Parameters | Description |
|------|-----------|-------------|
| `read_object_source` | `objectUri` | Read ABAP source code (class, interface, program, include) |
| `read_object_structure` | `objectUri` | Read object metadata/structure (class components, includes) |
| `read_cds_source` | `cdsName` | Read CDS view DDL source |
| `read_behavior_definition` | `behaviorName` | Read RAP behavior definition source |
| `read_service_binding` | `bindingName` | Read OData service binding definition |
| `read_function_module` | `functionGroup`, `functionModule` | Read function module source and interface |
| `read_program` | `programName` | Read ABAP program/report source |
| `read_table_definition` | `tableName` | Read database table or structure definition from DDIC |
| `read_data_element` | `dataElementName` | Read data element definition from DDIC |
| `read_access_control` | `accessControlName` | Read CDS access control (DCL) source |
| `read_metadata_extension` | `extensionName` | Read CDS metadata extension source (UI annotations) |
| `read_class_includes` | `className`, `includeType` | Read class includes (definitions, implementations, testclasses, macros) |

### Write Operations

All write tools handle lock/unlock automatically. Write operations require manual approval (not in `autoApprove`).

| Tool | Parameters | Description |
|------|-----------|-------------|
| `write_object_source` | `objectUri`, `source`, `lockUri?` | Write/update ABAP source (full replacement) |
| `write_cds_source` | `cdsName`, `source` | Write/update CDS view DDL source |
| `write_behavior_definition` | `behaviorName`, `source` | Write/update RAP behavior definition |
| `write_program` | `programName`, `source` | Write/update ABAP program source |
| `write_class_include` | `className`, `includeType`, `source` | Write class include (local types, test classes, etc.) |

### Create Operations

| Tool | Parameters | Description |
|------|-----------|-------------|
| `create_class` | `name`, `description`, `packageName`, `transportNumber`, `superClass?`, `interfaces?` | Create a new ABAP OO class |
| `create_interface` | `name`, `description`, `packageName`, `transportNumber` | Create a new ABAP interface |

### DevOps

| Tool | Parameters | Description |
|------|-----------|-------------|
| `activate_objects` | `objectUris[]` | Activate ABAP objects (syntax check + generation, like Ctrl+F3) |
| `check_syntax` | `objectUri` | Run syntax check without activating |
| `run_unit_tests` | `objectUri` | Execute ABAP Unit tests with pass/fail details |
| `run_atc_check` | `objectUri`, `checkVariant?` | Run ATC (ABAP Test Cockpit) checks |

### Transport Management

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_transports` | `user?`, `targetSystem?` | List open transport requests |
| `release_transport` | `transportNumber` | Release a transport request or task |

---

## Prompts

### `create-rap-bo`

Scaffolds a complete RAP Business Object with all artifacts:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `entityName` | Root entity name (e.g. `SalesOrder`) | — |
| `namespace` | Namespace prefix | `Z` |
| `scenario` | `managed`, `unmanaged`, or `managed_with_draft` | `managed` |

Generates: CDS interface view, consumption view, behavior definition, handler class, service definition, service binding, and draft table (if applicable).

### `review-abap-code`

Performs a thorough code review checking:

- Clean ABAP violations (SAP style guide)
- Performance issues (N+1 SELECTs, missing indexes)
- Security gaps (missing authority checks, SQL injection)
- Error handling (missing TRY/CATCH, broad CATCH cx_root)
- Testability (tight coupling, missing DI)
- RAP-specific issues (determination/validation timing)
- Naming conventions and missing ABAP Doc

| Parameter | Description |
|-----------|-------------|
| `objectUri` | ADT URI of the object to review |

---

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| `system-info` | `sap://system/info` | SAP connection info (host, client, SID, language, user) |

---

## Security

### Auto-Approve Strategy

The `autoApprove` list in the MCP config only includes **read-only tools**. All write operations (`write_*`, `create_*`, `activate_*`, `release_*`) require explicit user approval per call. This prevents accidental modifications to your SAP system.

### Credential Management

- Credentials are passed via environment variables in the MCP config
- The MCP config file (`.kiro/settings/mcp.json`) is gitignored
- An example template is provided at `.kiro/settings/mcp.example.json`
- For production use, inject credentials via your CI/CD pipeline or secrets manager

### SAP Authorization

The MCP server operates with the permissions of the configured SAP user. Ensure the user has appropriate `S_DEVELOP` authorization. For read-only scenarios, a user with display-only developer access is sufficient.

---

## Kiro Hooks

Pre-built hooks are provided in the `hooks/` directory. Copy them to `.kiro/hooks/` in your workspace to activate.

### `sap-mcp-safety.kiro.hook` — Write Operation Guard

**Trigger**: `preToolUse` — fires before any MCP tool matching `.*write.*`, `.*activate.*`, `.*release.*`, `.*create.*`

**Action**: Asks the agent to verify:
1. The object name and content are correct
2. The user has confirmed the change is intentional
3. The target system is DEV (not QAS/PRD)

This acts as a safety net preventing the AI from accidentally modifying production objects.

**Installation:**

```bash
cp sap-adt-mcp-server/hooks/sap-mcp-safety.kiro.hook .kiro/hooks/
```

### `sap-mcp-refresh.kiro.hook` — Auto-Refresh Reminder

**Trigger**: `postToolUse` — fires after any MCP tool matching `.*write.*`, `.*activate.*`

**Action**: Reminds the agent to tell the user to refresh open `sap://` files in the VS Code extension, since MCP writes bypass the extension's virtual filesystem cache.

**Installation:**

```bash
cp sap-adt-mcp-server/hooks/sap-mcp-refresh.kiro.hook .kiro/hooks/
```

### Creating Custom Hooks

Hooks are JSON files with `.kiro.hook` extension in `.kiro/hooks/`. Schema:

```json
{
  "enabled": true,
  "name": "Hook Display Name",
  "description": "What this hook does",
  "version": "1",
  "when": {
    "type": "preToolUse | postToolUse | fileEdited | fileCreated | promptSubmit | agentStop | userTriggered",
    "toolTypes": ["regex-pattern-to-match-tool-names"],
    "patterns": ["*.abap"]
  },
  "then": {
    "type": "askAgent | runCommand",
    "prompt": "Instructions for the agent (askAgent)",
    "command": "shell command to run (runCommand)"
  }
}
```

**Useful hook ideas for SAP development:**

| Hook | Trigger | Action |
|------|---------|--------|
| Lint on save | `fileEdited` + `*.abap` | `askAgent`: run lint and fix |
| Auto-activate | `postToolUse` + `.*write.*` | `askAgent`: activate the written object |
| Transport check | `preToolUse` + `.*write.*` | `askAgent`: verify transport assignment |
| Syntax check after edit | `fileEdited` + `*.abap` | `runCommand`: trigger syntax check |

---

## ADT URI Reference

Common ADT URI patterns used with the tools:

| Object Type | URI Pattern |
|-------------|-------------|
| Class (source) | `/sap/bc/adt/oo/classes/{name}/source/main` |
| Class (metadata) | `/sap/bc/adt/oo/classes/{name}` |
| Class include | `/sap/bc/adt/oo/classes/{name}/includes/{type}` |
| Interface | `/sap/bc/adt/oo/interfaces/{name}/source/main` |
| Program | `/sap/bc/adt/programs/programs/{name}/source/main` |
| Include | `/sap/bc/adt/programs/includes/{name}/source/main` |
| Function Group | `/sap/bc/adt/functions/groups/{group}/source/main` |
| Function Module | `/sap/bc/adt/functions/groups/{group}/fmodules/{name}/source/main` |
| CDS View | `/sap/bc/adt/ddic/ddl/sources/{name}/source/main` |
| Access Control | `/sap/bc/adt/acm/dcl/sources/{name}/source/main` |
| Metadata Extension | `/sap/bc/adt/ddic/ddlx/sources/{name}/source/main` |
| Behavior Definition | `/sap/bc/adt/bo/behaviordefinitions/{name}/source/main` |
| Table | `/sap/bc/adt/ddic/tables/{name}` |
| Data Element | `/sap/bc/adt/ddic/dataelements/{name}` |
| Service Binding | `/sap/bc/adt/businessservices/bindings/{name}` |

All object names in URIs must be **lowercase**.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `CSRF fetch failed: 401` | Check username/password in env vars |
| `CSRF fetch failed: 403` | User may lack ADT authorization — check `S_DEVELOP` |
| Connection timeout | Verify SAP host is reachable and port is correct |
| `Lock failed` | Object is locked by another user — check SM12 |
| No search results | Ensure ICF node `/sap/bc/adt/repository/informationsystem` is active |
| Write fails silently | Check transport assignment — object may need a TR |
| Self-signed cert errors | Set `NODE_TLS_REJECT_UNAUTHORIZED=0` in env (dev only) |

---

## License

MIT
