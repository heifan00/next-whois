const path = require("node:path");

const port = "3010";

module.exports = {
  apps: [
    {
      name: "next-whois",
      cwd: __dirname,
      script: path.join(__dirname, "node_modules", "next", "dist", "bin", "next"),
      args: `start -H 127.0.0.1 -p ${port}`,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: port,
      },
    },
  ],
};
