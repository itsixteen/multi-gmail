# Third-party notices

The account-selection model in this plugin was informed by:

- `navbuildz/gmail-mcp-server`, Copyright its contributors, MIT License: https://github.com/navbuildz/gmail-mcp-server

This plugin is a separate implementation. It uses a local stdio transport, macOS Keychain storage, PKCE and random OAuth state, explicit MCP safety annotations, and per-account error reporting. It does not deploy or copy the reference server's unauthenticated public `/mcp` endpoint.
