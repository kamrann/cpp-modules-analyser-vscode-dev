import { execFileSync } from 'child_process';

// Get the tool name from the command line argument
const toolEnvVar = process.argv[2];

if (!toolEnvVar) {
  console.error("Usage: node run-tool.js <ENV_VAR_NAME>");
  process.exit(1);
}

// Lookup the environment variable value
const toolPath = process.env[toolEnvVar];

if (!toolPath) {
  console.error(`Environment variable "${toolEnvVar}" is not defined.`);
  process.exit(1);
}

// Pass remaining args (after the tool name arg) to the tool
const args = process.argv.slice(3);

try {
  execFileSync(toolPath, args, { stdio: "inherit" });
} catch (err) {
  console.error(`Failed to execute "${toolPath}":`, err.message);
  process.exit(1);
}
