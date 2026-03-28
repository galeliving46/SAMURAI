# S.A.M.U.R.A.I. (SAP ADT MCP Server)

**S**AP **A**DT **M**CP **U**nified **R**emote **A**BAP **I**nterface — *a disciplined warrior cutting through code.*

> *武士道 (Bushidō) — "The way of the warrior" = "The way of the ABAPer."*

<p align="center">
  <img src="assets/samurai_banner.png" alt="S.A.M.U.R.A.I. Hero" width="100%">
</p>

> *"Every once in a while, a revolutionary product comes along that changes everything. For decades, ABAP development has meant navigating clunky interfaces, wrestling with archaic workflows, and dealing with an experience that feels disconnected from the modern world. Today, we're changing all of that. We are giving your AI—your Antigravity, your Cursor, your Kiro—direct, unbridled access to your SAP system with the discipline and precision of a master. It’s not just faster; it’s magical. Imagine telling your AI to build a complete RAP Business Object, test it, and release the transport—all while you just watch the magic happen. It’s a katana for your ABAP mind. It just works. Welcome to the way of the modern SAP warrior."* 

An open-source [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI coding assistants direct access to SAP systems via the ADT (ABAP Development Tools) REST API. Read, write, activate, test, and manage ABAP objects — all from your IDE's AI assistant.

Works with **any MCP-compatible client**: Antigravity, Kiro, Cursor, Claude Desktop, Windsurf, Cline, and more.

Works with **any SAP system** that has ADT enabled: S/4HANA, ECC, BW, CRM — on-premise or cloud. No vendor lock-in, no hardcoded config.

---

## What Can It Do?

| Category | Capabilities |
|----------|-------------|
| **Search & Navigate** | Find ABAP objects by name/pattern, where-used lists, package contents, code completion |
| **Read Source** | Classes, interfaces, programs, function modules, CDS views, behavior definitions, service bindings, access controls, metadata extensions, table definitions, data elements, class includes (local types, test classes, AMDP) |
| **Write Source** | Update classes, programs, CDS views, behavior definitions, class includes — with automatic lock/unlock and optimistic conflict detection |
| **Create Objects** | Create new classes and interfaces with transport assignment |
| **DevOps** | Activate objects (Ctrl+F3), syntax check, ABAP Unit tests, ATC (ABAP Test Cockpit) checks |
| **Transports** | List open transport requests, release transports |
| **Prompts** | RAP Business Object scaffolding, ABAP code review |

**30 tools, 2 prompt templates, 1 resource** — covering the full ABAP development lifecycle.

---

## Quick Start

### 1. Prerequisites

- **Node.js** 18+ installed
- **SAP system** with ADT enabled (ICF node `/sap/bc/adt` active)
- **SAP user** with developer authorization (`S_DEVELOP`)

### 2. Build

```bash
cd sap-adt-mcp-server
npm install
npm run build
```

### 3. Configure Your AI Client

Pick your IDE and add the config below. Replace the placeholder values with your SAP system details.

---

#### Antigravity (Google)

Antigravity supports MCP servers natively. You can configure them in two ways:

**Option 1 — Via UI (Recommended):**
1. Open the **Agent/Chat** pane → click the **three-dot menu (`...`)**
2. Select **MCP Servers** → **Manage MCP Servers**
3. Click **View raw config** to open `mcp_config.json`
4. Add the `sap-adt` server entry below and save

**Option 2 — Project-level config:**

Create `.vscode/mcp.json` in your project root (Antigravity will auto-detect it):

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["/absolute/path/to/sap-adt-mcp-server/dist/index.js"],
      "env": {
        "SAP_HOST": "http://your-sap-server:8000",
        "SAP_CLIENT": "100",
        "SAP_USERNAME": "DEVELOPER",
        "SAP_PASSWORD": "your-password",
        "SAP_LANGUAGE": "EN"
      }
    }
  }
}
```

> **Note:** After saving, restart Antigravity or refresh the MCP list. The server should appear as "Enabled" in the Manage MCP Servers view.

---

#### Kiro

Create `.kiro/settings/mcp.json` in your workspace root:

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["sap-adt-mcp-server/dist/index.js"],
      "env": {
        "SAP_HOST": "http://your-sap-server:8000",
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

> **Tip:** `autoApprove` lists read-only tools that won't modify your SAP system. All write/create/activate/release tools require manual approval per call.


---

#### Cursor

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["/absolute/path/to/sap-adt-mcp-server/dist/index.js"],
      "env": {
        "SAP_HOST": "http://your-sap-server:8000",
        "SAP_CLIENT": "100",
        "SAP_USERNAME": "DEVELOPER",
        "SAP_PASSWORD": "your-password",
        "SAP_LANGUAGE": "EN"
      }
    }
  }
}
```

> **Note:** Cursor requires absolute paths in `args`.

---

#### Claude Desktop

Add to your Claude Desktop config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["/absolute/path/to/sap-adt-mcp-server/dist/index.js"],
      "env": {
        "SAP_HOST": "http://your-sap-server:8000",
        "SAP_CLIENT": "100",
        "SAP_USERNAME": "DEVELOPER",
        "SAP_PASSWORD": "your-password",
        "SAP_LANGUAGE": "EN"
      }
    }
  }
}
```

---

#### Windsurf

Open the **Cascade** panel → click the **MCPs icon** → **Configure** → **View raw config** to open `mcp_config.json`.

Or edit the file directly:
- **macOS/Linux:** `~/.codeium/windsurf/mcp_config.json`
- **Windows:** `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["/absolute/path/to/sap-adt-mcp-server/dist/index.js"],
      "env": {
        "SAP_HOST": "http://your-sap-server:8000",
        "SAP_CLIENT": "100",
        "SAP_USERNAME": "DEVELOPER",
        "SAP_PASSWORD": "your-password",
        "SAP_LANGUAGE": "EN"
      }
    }
  }
}
```

> **Note:** Make sure MCP is enabled in **Windsurf Settings → Advanced Settings → Cascade**. Click **Refresh** in the MCP panel after saving.

---

#### Cline (VS Code Extension)

Click the **MCP Servers** icon in Cline's top nav bar → **Configure** → **Configure MCP Servers** to open `cline_mcp_settings.json`, then add:

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "node",
      "args": ["/absolute/path/to/sap-adt-mcp-server/dist/index.js"],
      "env": {
        "SAP_HOST": "http://your-sap-server:8000",
        "SAP_CLIENT": "100",
        "SAP_USERNAME": "DEVELOPER",
        "SAP_PASSWORD": "your-password",
        "SAP_LANGUAGE": "EN"
      }
    }
  }
}
```

---

#### Any Other MCP Client

This server uses **stdio transport** — the standard MCP communication method. Any client that supports MCP stdio servers can use it. Just point to the built `dist/index.js` and pass the environment variables.

---

### 4. Verify Connection

After configuring, ask your AI assistant:

> "Test the SAP connection"

It should call `test_connection` and report success with your host and client number.

---

## Connection Modes

The server supports two connection modes, matching Eclipse ADT:

### Mode 1 — Direct URL (Recommended)

```
SAP_HOST=http://sap-server.example.com:8000
```

### Mode 2 — Eclipse-style (Application Server + Instance Number)

```
SAP_ASHOST=sap-server.example.com
SAP_SYSNR=00
SAP_SSL=true
SAP_SID=S4H
```

Eclipse-style auto-constructs the URL:
- HTTPS → `https://host:443<nn>` (e.g., instance 00 → port 44300)
- HTTP → `http://host:80<nn>` (e.g., instance 00 → port 8000)

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SAP_HOST` | Yes* | — | Full SAP system URL (e.g., `http://server:8000`) |
| `SAP_ASHOST` | Yes* | — | Application server hostname |
| `SAP_SYSNR` | Yes* | — | Instance number (e.g., `00`) |
| `SAP_SSL` | No | `true` | Use HTTPS (`true`/`false`) |
| `SAP_SID` | No | — | System ID, informational (e.g., `S4H`) |
| `SAP_CLIENT` | No | `100` | SAP client number |
| `SAP_USERNAME` | Yes | — | SAP username |
| `SAP_PASSWORD` | Yes | — | SAP password |
| `SAP_LANGUAGE` | No | `EN` | Logon language |

*Provide either `SAP_HOST` **or** `SAP_ASHOST` + `SAP_SYSNR`.


---

## Tools Reference (30 Tools)

### System

| Tool | Description |
|------|-------------|
| `test_connection` | Test connectivity via ADT discovery endpoint |

### Search & Navigation

| Tool | Key Parameters | Description |
|------|---------------|-------------|
| `search_objects` | `query`, `objectType?`, `maxResults?` | Search ABAP objects by name pattern (wildcards `*` supported) |
| `where_used` | `objectUri` | Find all references to an object (where-used list) |
| `list_package_contents` | `packageName` | List all objects in a development package |
| `get_code_completion` | `objectUri`, `line`, `column` | Code completion suggestions at a position |

### Read Operations

| Tool | Key Parameters | Description |
|------|---------------|-------------|
| `read_object_source` | `objectUri` | Read ABAP source (class, interface, program, include, FM) |
| `read_object_structure` | `objectUri` | Read object metadata (class components, includes) |
| `read_cds_source` | `cdsName` | Read CDS view DDL source |
| `read_behavior_definition` | `behaviorName` | Read RAP behavior definition |
| `read_service_binding` | `bindingName` | Read OData service binding |
| `read_function_module` | `functionGroup`, `functionModule` | Read function module source + interface |
| `read_program` | `programName` | Read ABAP program/report source |
| `read_table_definition` | `tableName` | Read DB table/structure definition from DDIC |
| `read_data_element` | `dataElementName` | Read data element definition from DDIC |
| `read_access_control` | `accessControlName` | Read CDS access control (DCL) source |
| `read_metadata_extension` | `extensionName` | Read CDS metadata extension (UI annotations) |
| `read_class_includes` | `className`, `includeType` | Read class includes: `definitions`, `implementations`, `testclasses`, `macros` |

### Write Operations

All write tools handle lock/unlock automatically. Support `expectedSource` parameter for optimistic conflict detection.

| Tool | Key Parameters | Description |
|------|---------------|-------------|
| `write_object_source` | `objectUri`, `source`, `lockUri?`, `expectedSource?` | Write/update ABAP source (full replacement) |
| `write_cds_source` | `cdsName`, `source`, `expectedSource?` | Write/update CDS view DDL |
| `write_behavior_definition` | `behaviorName`, `source`, `expectedSource?` | Write/update RAP behavior definition |
| `write_program` | `programName`, `source`, `expectedSource?` | Write/update ABAP program |
| `write_class_include` | `className`, `includeType`, `source`, `expectedSource?` | Write class include (local types, test classes, etc.) |

### Create Operations

| Tool | Key Parameters | Description |
|------|---------------|-------------|
| `create_class` | `name`, `description`, `packageName`, `transportNumber`, `superClass?`, `interfaces?` | Create a new ABAP class |
| `create_interface` | `name`, `description`, `packageName`, `transportNumber` | Create a new ABAP interface |

### DevOps

| Tool | Key Parameters | Description |
|------|---------------|-------------|
| `activate_objects` | `objectUris[]` | Activate objects (syntax check + generation, like Ctrl+F3) |
| `check_syntax` | `objectUri` | Syntax check without activation |
| `run_unit_tests` | `objectUri` | Execute ABAP Unit tests with pass/fail details |
| `run_atc_check` | `objectUri`, `checkVariant?` | Run ATC checks (code inspector, custom checks) |

### Transport Management

| Tool | Key Parameters | Description |
|------|---------------|-------------|
| `list_transports` | `user?`, `targetSystem?` | List open transport requests |
| `release_transport` | `transportNumber` | Release a transport request or task |

---

## Prompt Templates

### `create-rap-bo` — RAP Business Object Scaffolding

Generates a complete RAP BO with all artifacts:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `entityName` | Root entity name (e.g., `SalesOrder`) | — |
| `namespace` | Namespace prefix | `Z` |
| `scenario` | `managed`, `unmanaged`, or `managed_with_draft` | `managed` |

Produces: CDS interface view, consumption view, behavior definition, handler class, service definition, service binding, and draft table (if applicable).

### `review-abap-code` — Code Review

Performs a thorough review checking:
- Clean ABAP violations
- Performance issues (N+1 SELECTs, missing indexes)
- Security gaps (missing authority checks, SQL injection)
- Error handling quality
- Testability
- RAP-specific issues
- Naming conventions
- Missing ABAP Doc

| Parameter | Description |
|-----------|-------------|
| `objectUri` | ADT URI of the object to review |

---

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| System Info | `sap://system/info` | Connection details (host, client, SID, language, user) |


---

## ADT URI Reference

Common URI patterns used with the tools. All object names in URIs must be **lowercase**.

| Object Type | URI Pattern | Example |
|-------------|-------------|---------|
| Class (source) | `/sap/bc/adt/oo/classes/{name}/source/main` | `/sap/bc/adt/oo/classes/zcl_my_class/source/main` |
| Class (metadata) | `/sap/bc/adt/oo/classes/{name}` | `/sap/bc/adt/oo/classes/zcl_my_class` |
| Interface | `/sap/bc/adt/oo/interfaces/{name}/source/main` | `/sap/bc/adt/oo/interfaces/zif_my_intf/source/main` |
| Program | `/sap/bc/adt/programs/programs/{name}/source/main` | `/sap/bc/adt/programs/programs/zmy_report/source/main` |
| Include | `/sap/bc/adt/programs/includes/{name}/source/main` | — |
| Function Group | `/sap/bc/adt/functions/groups/{group}/source/main` | — |
| Function Module | `/sap/bc/adt/functions/groups/{group}/fmodules/{name}/source/main` | — |
| CDS View | `/sap/bc/adt/ddic/ddl/sources/{name}/source/main` | `/sap/bc/adt/ddic/ddl/sources/zi_salesorder/source/main` |
| Access Control | `/sap/bc/adt/acm/dcl/sources/{name}/source/main` | — |
| Metadata Extension | `/sap/bc/adt/ddic/ddlx/sources/{name}/source/main` | — |
| Behavior Definition | `/sap/bc/adt/bo/behaviordefinitions/{name}/source/main` | — |
| Table | `/sap/bc/adt/ddic/tables/{name}` | `/sap/bc/adt/ddic/tables/mara` |
| Data Element | `/sap/bc/adt/ddic/dataelements/{name}` | `/sap/bc/adt/ddic/dataelements/matnr` |
| Service Binding | `/sap/bc/adt/businessservices/bindings/{name}` | — |

---

## Conflict Detection

Write tools support **optimistic concurrency control** via the `expectedSource` parameter:

1. Read the source with `read_object_source` (or equivalent read tool)
2. Make your changes
3. Pass the original source as `expectedSource` when writing
4. If someone else modified the object in between, the write is **aborted** with a conflict message showing the differences
5. Re-read, merge, and retry

This prevents accidentally overwriting changes made by other developers. If you omit `expectedSource`, the write proceeds without conflict checking (backward compatible).

---

## MCP Safety & Automation

Because the SAP system is a live enterprise environment, safety checks and workflow reminders are critical. We provide two ways to enforce this, depending on your AI client.

### 1. Kiro (Event-Driven Hooks)

Pre-built hooks are included in the `hooks/` directory for Kiro users. These natively hook into the tool execution lifecycle to pause and mandate the agent to verify safety.

**Installation:**

```bash
# Copy hooks to your workspace
cp sap-adt-mcp-server/hooks/*.kiro.hook .kiro/hooks/
```

**`sap-mcp-safety.kiro.hook` — Write Operation Guard**

Fires **before** any write/activate/release/create tool call. Asks the agent to verify:
1. Object name and content are correct
2. User has confirmed the change is intentional
3. Target system is DEV (not QAS/PRD)
4. `expectedSource` is passed for conflict detection

**`sap-mcp-refresh.kiro.hook` — Auto-Refresh Reminder**

Fires **after** any write/activate tool call. Reminds the agent to tell the user to refresh open files in the SAP ADT VS Code extension.

**Custom Hook Ideas:**

| Hook | Trigger | Action |
|------|---------|--------|
| Auto-activate after write | `postToolUse` + `.*write.*` | `askAgent`: activate the written object |
| Transport check before write | `preToolUse` + `.*write.*` | `askAgent`: verify transport assignment |
| Syntax check on ABAP save | `fileEdited` + `*.abap` | `runCommand`: trigger syntax check |
| ATC check before release | `preToolUse` + `.*release.*` | `askAgent`: run ATC first |

### 2. Antigravity, Cursor, Windsurf, & Cline (Persistent Rules)

Other clients either don't support event-driven JSON hooks or use complex scripted implementations. For these IDEs, we've baked the **exact same safety logic natively into the AI's core instructions** via the ABAP Steering & Skills file (see the next section).

By installing the specific skill or rule file for your client, your AI assistant is strictly mandated to verify every write operation and remind you to refresh open files, bypassing the need for separate hook files entirely.

---

## AI Steering & Skills — Make Your AI Think Like a Senior ABAPer

This repo includes a comprehensive ABAP expert knowledge base that turns your AI assistant into a senior ABAP consultant with 25 years of experience. It covers:

- Strict naming conventions (ZCL_, ZIF_, ZI_, ZC_, etc.)
- Modern ABAP 7.40+ patterns (inline declarations, string templates, VALUE #, FILTER, REDUCE)
- Internal table best practices (SORTED, HASHED, secondary keys)
- SELECT optimization (no SELECT *, no SELECT in LOOP, FOR ALL ENTRIES guards)
- Error handling standards (class-based exceptions, BAL logging)
- OO design principles (DI, interfaces, factory pattern)
- CDS view architecture (VDM layering: Basic → Composite → Consumption)
- RAP patterns (managed, unmanaged, draft, side effects, feature control)
- AMDP examples for HANA-native logic
- Authority check patterns
- Unit testing standards (test doubles, GIVEN-WHEN-THEN, CL_OSQL_TEST_ENVIRONMENT)
- Transport discipline
- Code review checklist (20 items)
- Anti-patterns that get immediately rejected

### How to Use the Steering File / Skills

#### Antigravity

Antigravity natively supports skills for persistent context. Copy the provided Antigravity skill into your workspace:

```bash
# From your project root
mkdir -p .agents/skills/senior-abap-developer
cp -r sap-adt-mcp-server/antigravity-skills/senior-abap-developer .agents/skills/
```

Antigravity will automatically index and apply this deep ABAP expertise when working on your SAP tasks.

#### Kiro

Copy the steering file into your workspace's `.kiro/steering/` directory. It will be **automatically included** in every conversation — no manual action needed.

```bash
# From your project root
mkdir -p .kiro/steering
cp sap-adt-mcp-server/kiro-steering/skill-abap-senior.md .kiro/steering/
```

The `inclusion: auto` front-matter in the file tells Kiro to always load it. You can change it to `inclusion: manual` if you only want it included when you explicitly reference it with `#skill-abap-senior` in chat.

#### Cursor

Cursor uses "Rules for AI" for persistent instructions. Copy the content of `kiro-steering/skill-abap-senior.md` (without the front-matter block) into:

**Project-level (recommended):** Create `.cursor/rules/abap-senior.mdc` in your project root:

```
---
description: ABAP Senior Architect coding standards
globs: "**/*.abap"
alwaysApply: true
---

(paste the content of skill-abap-senior.md here, without the front-matter)
```

**Or user-level:** Go to Cursor Settings → Rules for AI → paste the content there. This applies to all your projects.

#### Claude Desktop (Claude.ai Projects)

1. Open Claude.ai → Create or open a Project
2. Go to Project Knowledge → Add content
3. Paste the full content of `kiro-steering/skill-abap-senior.md`
4. Or upload the file directly as a project file

Every conversation in that project will now have the ABAP expertise loaded.

#### Windsurf

Windsurf uses "Rules" files. Create `.windsurfrules` in your project root and paste the content of the steering file.

```bash
cp sap-adt-mcp-server/kiro-steering/skill-abap-senior.md .windsurfrules
```

#### Cline

Cline supports custom instructions. Go to Cline settings → Custom Instructions → paste the content of the steering file.

Alternatively, create `.clinerules` in your project root:

```bash
cp sap-adt-mcp-server/kiro-steering/skill-abap-senior.md .clinerules
```

#### Any Other AI Tool

Most AI coding assistants support some form of system prompt or custom instructions. The steering file is plain Markdown — just paste its content wherever your tool accepts persistent instructions. Strip the YAML front-matter block (`---` ... `---`) at the top if the tool doesn't understand it.

---

## Security

### Auto-Approve Strategy

The recommended `autoApprove` list only includes **read-only tools**. All write operations (`write_*`, `create_*`, `activate_*`, `release_*`) require explicit user approval. This prevents accidental modifications to your SAP system.

### Credential Safety

- Credentials are passed via environment variables — never hardcoded in source
- The MCP config file is `.gitignore`d by default
- An example template is provided at `.kiro/settings/mcp.example.json`
- For team/production use, inject credentials via your CI/CD pipeline, secrets manager, or environment

### SAP Authorization

The server operates with the permissions of the configured SAP user. Recommendations:

| Use Case | Authorization Level |
|----------|-------------------|
| Read-only exploration | Display-only developer access |
| Active development | Full `S_DEVELOP` authorization |
| Transport release | `S_CTS_ADMI` authorization |
| Production systems | **Don't.** Use read-only access at most. |

### Self-Signed Certificates

For development SAP systems with self-signed SSL certificates:

```json
"env": {
  "NODE_TLS_REJECT_UNAUTHORIZED": "0",
  ...
}
```

⚠️ Only use this for development systems. Never in production.

---

## SAP System Requirements

The server uses standard SAP ADT REST APIs. Your SAP system needs:

1. **ADT enabled** — ICF node `/sap/bc/adt` must be active
2. **ICF services active:**
   - `/sap/bc/adt/discovery` (connection test)
   - `/sap/bc/adt/repository/informationsystem` (search, where-used)
   - `/sap/bc/adt/oo/classes` (class operations)
   - `/sap/bc/adt/oo/interfaces` (interface operations)
   - `/sap/bc/adt/programs/programs` (program operations)
   - `/sap/bc/adt/ddic/ddl/sources` (CDS views)
   - `/sap/bc/adt/bo/behaviordefinitions` (RAP behavior)
   - `/sap/bc/adt/functions/groups` (function modules)
   - `/sap/bc/adt/ddic/tables` (table definitions)
   - `/sap/bc/adt/ddic/dataelements` (data elements)
   - `/sap/bc/adt/cts/transportrequests` (transports)
   - `/sap/bc/adt/abapunit/testruns` (unit tests)
   - `/sap/bc/adt/atc/runs` (ATC checks)
   - `/sap/bc/adt/activation` (activation)
   - `/sap/bc/adt/checkruns` (syntax check)
3. **Supported SAP versions:** Any system with ADT support — SAP NetWeaver 7.40+, S/4HANA (all versions), BW/4HANA

To check if ADT is active, try accessing `http://your-sap-server:port/sap/bc/adt/discovery` in a browser. You should get an XML response (after authentication).

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `CSRF fetch failed: 401` | Wrong username/password — check env vars |
| `CSRF fetch failed: 403` | User lacks ADT authorization — check `S_DEVELOP` in SU01 |
| Connection timeout | Verify SAP host is reachable and port is correct |
| `Lock failed` | Object locked by another user — check SM12 |
| No search results | ICF node `/sap/bc/adt/repository/informationsystem` may be inactive — check SICF |
| Write fails silently | Object may need a transport request — check SE09 |
| Self-signed cert errors | Add `NODE_TLS_REJECT_UNAUTHORIZED=0` to env (dev only) |
| `ECONNREFUSED` | SAP server is down or port is wrong |
| Tools not showing up | Rebuild with `npm run build`, restart your AI client |

---

## Example Conversations

Here are some things you can ask your AI assistant once the server is connected:

```
"Search for all custom classes starting with ZCL_SD"

"Read the source code of class ZCL_MM_PO_VALIDATOR"

"Show me the structure of table EKPO"

"What objects are in package ZMM_PURCHASING?"

"Find all usages of interface ZIF_SD_PRICING_ENGINE"

"Create a new class ZCL_FI_PAYMENT_HANDLER in package ZFI_PAYMENTS on transport DEVK900456"

"Run unit tests for class ZCL_SD_ORDER_PROCESSOR"

"Run ATC checks on program ZMM_STOCK_REPORT"

"Review the code quality of ZCL_PP_PRODUCTION_ORDER"

"Scaffold a RAP Business Object for entity SalesOrder with draft support"

"Show me open transports for user DEVELOPER"

"Read the CDS view ZI_SALESORDER and its behavior definition"
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  AI Client (Kiro / Cursor / Claude / etc.)  │
└──────────────────┬──────────────────────────┘
                   │ MCP (stdio)
┌──────────────────▼──────────────────────────┐
│           sap-adt-mcp-server                │
│  ┌─────────────────────────────────────┐    │
│  │  index.ts — 30 tools, 2 prompts     │    │
│  │  adt-client.ts — HTTP client, CSRF  │    │
│  │  xml-utils.ts — ADT XML parsing     │    │
│  └─────────────────────────────────────┘    │
└──────────────────┬──────────────────────────┘
                   │ HTTP/HTTPS (ADT REST API)
┌──────────────────▼──────────────────────────┐
│         SAP System (any version)            │
│  /sap/bc/adt/* endpoints                    │
└─────────────────────────────────────────────┘
```

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes in `src/`
4. Build: `npm run build`
5. Test against your SAP dev system
6. Submit a PR

### Adding a New Tool

1. Add the tool definition in `src/index.ts` using `server.tool()`
2. Use `adt.get()` for reads, `adt.post()` / `adt.put()` for writes
3. For write tools, implement lock/unlock and conflict detection (see existing write tools as reference)
4. Add the tool to the README
5. If read-only, add to the `autoApprove` list in the example config

---

## License

MIT — use it, fork it, ship it.
