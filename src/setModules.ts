import fs from "fs";
import path from "path";
import process from "process";
import { delDirectory, zipFile } from "./utils";

export default async function setModules(rep: string, compressFlag: boolean): Promise<void> {
  if (!rep) {
    console.log("Missing file path");
    return;
  }

  let target = rep;
  if (!fs.existsSync(target)) {
    target = path.join(process.cwd(), target);

    if (!fs.existsSync(target)) {
      console.log("File path not found", target);
      return;
    }
  }

  const list = fs.readdirSync(target);
  console.log("Deleting redundant files");
  for (const item of list) {
    const p = path.join(target, item, "node_modules");
    if (fs.existsSync(p)) {
      delDirectory(p);
    }
  }

  console.log("Finish deleting redundant files");

  if (compressFlag) {
    const zipPath = path.join(target, "../", "node_modules.zip");
    if (fs.existsSync(zipPath)) {
      fs.rmSync(zipPath);
    }

    console.log("Compressing files");
    await zipFile(target, zipPath);
    console.log("finish Compress files");
  }
}
