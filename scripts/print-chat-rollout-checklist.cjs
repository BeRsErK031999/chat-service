console.log("chat controlled rollout checklist");
console.log("No requests are executed and no secrets are required.\n");

console.log("Desktop rollout gate");
console.log("- CHAT_ENABLED is unset or false by default for ordinary production users");
console.log("- CHAT_BETA_USER_IDS and CHAT_BETA_EMAILS contain only intended internal beta users");
console.log("- Rollout flags are read by Electron main, not by renderer auth code");
console.log("- Renderer does not receive CHAT_INTERNAL_AUTH_SECRET or desktop session tokens");
console.log("- Hidden desktop shortcut opens chat only after main-process rollout access passes");

console.log("\nRuntime invariants to preserve");
console.log("- chat-service production auth remains bearer-only with CHAT_ALLOW_DEV_USER_ID=false");
console.log("- SSE remains enabled for authorized chat users");
console.log("- ActivityPanel, navigation continuity, and diagnostics remain compiled and unchanged");
console.log("- Feature gates do not replace bearer auth, room membership checks, or notification permissions");
console.log("- A disabled desktop entry point means no desktop ChatWidget mount and no EventSource for that user");

console.log("\nBeta smoke");
console.log("- Ordinary user with CHAT_ENABLED=false sees no desktop chat button and cannot open the hidden overlay");
console.log("- Allowlisted beta user with CHAT_ENABLED=false can open the overlay with Ctrl+Shift+Alt+C");
console.log("- Beta user reaches Realtime connected and activeEventSourceCount remains 1 for one open overlay");
console.log("- Navigation restore, ActivityPanel actions, and diagnostics still behave as in the readiness matrix");
console.log("- Logs and diagnostics contain no bearer token, accessToken query string, Authorization header, or secret");

console.log("\nRollback");
console.log("- Set CHAT_ENABLED=false and remove users from CHAT_BETA_USER_IDS and CHAT_BETA_EMAILS");
console.log("- Restart desktop clients so Electron main reloads rollout env");
console.log("- Keep chat-service auth, SSE, and diagnostics deployed; do not fork builds or remove chat code");
