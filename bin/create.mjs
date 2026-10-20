#!/usr/bin/env node
// Usage: npx create-cf-static-site <dir> [--name <worker-name>]
// Copies template/ into <dir>, names the project, and installs the pinned cf CLI.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { WORKER_NAME_PATTERN } from "../template/scripts/lib/build-output.mjs";

const TEMPLATE_DIR = fileURLToPath(new URL("../template", import.meta.url));
// MIT asks that copies keep the license notice, so every new project gets one.
const LICENSE_PATH = fileURLToPath(new URL("../LICENSE", import.meta.url));
// The Worker name in the template's package.json and cloudflare.config.ts.
const TEMPLATE_NAME = "static-site";
// Local state from working on the template. npm never publishes these (see
// package.json → files), but running from a git checkout would copy them.
// The lockfile is skipped too: `npm install` writes a fresh one for the new name.
const SKIPPED = new Set(["node_modules", "dist", ".cloudflare", ".env", "package-lock.json"]);
// npm never publishes a file named .gitignore, so the template ships it renamed.
const RENAMES = { _gitignore: ".gitignore" };
// The template imports cloudflare.config.ts directly, which needs Node 24's
// built-in TypeScript type stripping.
const MIN_NODE_MAJOR = 24;

const USAGE = `Usage: npx create-cf-static-site <dir> [--name <worker-name>]

Creates a static site project that deploys to a Cloudflare Worker.

  <dir>          New or empty folder for the project
  --name <name>  Worker name (default: the folder name). 3-40 lowercase
                 letters, digits and dashes
  -h, --help     Show this help`;

/** A mistake in how the command was called, so the usage text is worth showing. */
class UsageError extends Error {}

// MARK: Inputs

function parseCli(argv) {
	let parsed;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			options: { name: { type: "string" }, help: { type: "boolean", short: "h" } },
		});
	} catch (error) {
		throw new UsageError(error.message);
	}
	const { values, positionals } = parsed;
	if (!values.help && positionals.length !== 1) {
		throw new UsageError(positionals.length === 0 ? "Missing <dir>." : "Pass exactly one <dir>.");
	}
	return { dir: positionals[0], name: values.name, help: values.help === true };
}

/** "My Site!" → "my-site": the closest valid Worker name to a folder name. */
function workerNameFrom(text) {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 40)
		.replace(/^-+|-+$/g, "");
}

function resolveName(targetDir, flagName) {
	const name = flagName ?? workerNameFrom(basename(targetDir));
	if (WORKER_NAME_PATTERN.test(name)) return name;
	const rule = "Use 3-40 lowercase letters, digits and dashes, starting and ending with a letter or digit.";
	if (flagName !== undefined) throw new UsageError(`--name "${name}" is not a valid Worker name. ${rule}`);
	throw new UsageError(`Can't make a Worker name from the folder name "${basename(targetDir)}". Pass --name. ${rule}`);
}

/** The target may be missing or an empty folder (so `.` works), nothing else. */
function assertTargetUsable(targetDir, dir) {
	if (!existsSync(targetDir)) return;
	if (!statSync(targetDir).isDirectory()) throw new Error(`${dir} exists and is not a folder.`);
	if (readdirSync(targetDir).length > 0) throw new Error(`${dir} is not empty. Pick a new or empty folder.`);
}

function warnOnOldNode() {
	const major = Number(process.versions.node.split(".")[0]);
	if (major < MIN_NODE_MAJOR) {
		console.warn(`WARNING: Node ${process.versions.node}. The project needs Node ${MIN_NODE_MAJOR}+ (run \`fnm use\` in it).`);
	}
}

// MARK: Scaffold

function copyTemplate(targetDir) {
	cpSync(TEMPLATE_DIR, targetDir, {
		recursive: true,
		filter: (src) => !SKIPPED.has(relative(TEMPLATE_DIR, src)),
	});
	for (const [from, to] of Object.entries(RENAMES)) {
		renameSync(join(targetDir, from), join(targetDir, to));
	}
	cpSync(LICENSE_PATH, join(targetDir, "LICENSE"));
}

function setProjectName(targetDir, name) {
	const packagePath = join(targetDir, "package.json");
	const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
	writeFileSync(packagePath, `${JSON.stringify({ ...pkg, name }, null, 2)}\n`);
	replaceOnce(join(targetDir, "cloudflare.config.ts"), `const NAME = "${TEMPLATE_NAME}";`, `const NAME = "${name}";`);
}

/** Fails loudly if the template changed and `from` no longer matches exactly once. */
function replaceOnce(path, from, to) {
	const text = readFileSync(path, "utf8");
	if (text.split(from).length !== 2) {
		throw new Error(`Template is out of date: expected \`${from}\` once in ${basename(path)}.`);
	}
	writeFileSync(path, text.replace(from, () => to));
}

/** Puts the target back the way it was: gone if this run created it, else empty. */
function undoScaffold(targetDir, createdTarget) {
	if (createdTarget) {
		rmSync(targetDir, { recursive: true, force: true });
		return;
	}
	for (const entry of readdirSync(targetDir)) {
		rmSync(join(targetDir, entry), { recursive: true, force: true });
	}
}

/** Installs the pinned cf CLI and writes the lockfile that `make install` and CI need. */
function installDeps(targetDir) {
	console.log("Installing the pinned cf CLI (npm install)...");
	const result = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
		cwd: targetDir,
		stdio: "inherit",
		// npm is npm.cmd on Windows, which only runs through a shell.
		shell: process.platform === "win32",
	});
	return result.status === 0;
}

function printNextSteps(targetDir, name, installed) {
	const cdPath = relative(process.cwd(), targetDir);
	const steps = [
		cdPath && `cd ${cdPath}`,
		!installed && "npm install",
		"Set DOMAINS in cloudflare.config.ts",
		"Do the one-time setup in docs/HUMAN_SETUP.md",
		"make deploy",
	].filter(Boolean);
	console.log(`\nCreated "${name}" in ${targetDir}\n\nNext:`);
	steps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
}

// MARK: Main

function main(argv) {
	const { dir, name: flagName, help } = parseCli(argv);
	if (help) {
		console.log(USAGE);
		return;
	}
	warnOnOldNode();

	const targetDir = resolve(dir);
	const name = resolveName(targetDir, flagName);
	assertTargetUsable(targetDir, dir);

	const createdTarget = !existsSync(targetDir);
	try {
		copyTemplate(targetDir);
		setProjectName(targetDir, name);
	} catch (error) {
		undoScaffold(targetDir, createdTarget);
		throw error;
	}

	// The files are complete at this point, so a failed install keeps them.
	const installed = installDeps(targetDir);
	if (!installed) console.warn("WARNING: npm install failed. Run it yourself in the new folder.");
	printNextSteps(targetDir, name, installed);
}

try {
	main(process.argv.slice(2));
} catch (error) {
	console.error(`ERROR: ${error.message}`);
	if (error instanceof UsageError) console.error(`\n${USAGE}`);
	process.exit(1);
}
