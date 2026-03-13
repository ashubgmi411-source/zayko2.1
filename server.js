// Railway-compatible server starter
// Forces HOSTNAME to 0.0.0.0 so Next.js binds to all interfaces
process.env.HOSTNAME = "0.0.0.0";
require("./.next/standalone/server.js");
