import { program } from "commander";
import pkg from "../package.json" with { type: "json" };
import { deploy } from "./commands/deploy";

program
	.name(pkg.name)
	.version(pkg.version)
	.description(pkg.description)
	.addCommand(deploy)
	.parse();
