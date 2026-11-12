# Security

CheckYourProcess stores task titles and local service credentials in the current user's data directory. The service listens on IPv4 loopback only. Browser previews use short-lived, single-use tickets and HttpOnly cookies; MCP widgets never receive the local bearer token.

Do not commit `.local/`, `.checkyourprocess/`, `runtime.json`, `token`, environment files, SQLite databases, tunnel credentials, or exported user data. Release packages copy the built runtime, the selected host's integration directory, documentation and licenses. Symlinks and credential/database filenames are rejected while assembling archives.

For a security issue, use GitHub's private vulnerability reporting feature on this repository when enabled. Do not post tokens, task data, or exploit details in public issues. Rotate exposed credentials and stop the local service before replacing its token file.

Secure MCP Tunnel is an optional connection to OpenAI. The database stays on the PC, but requested tool inputs and results travel through the selected AI host. Connecting a tunnel does not make the service an anonymous public endpoint.

Only install extensions and approve hooks from sources you trust. Hook scripts report supported activity events; they do not read chat transcripts or run arbitrary commands supplied by the model.
