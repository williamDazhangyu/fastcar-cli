import fs from "fs";
import path from "path";
import compressing from "compressing";
import yaml from "yaml";

export function copyDirectory(src: string, dest: string): boolean {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  if (!fs.existsSync(src)) {
    return false;
  }

  const dirs = fs.readdirSync(src);
  dirs.forEach((item) => {
    const itemPath = path.join(src, item);
    const temp = fs.statSync(itemPath);

    if (temp.isFile()) {
      fs.copyFileSync(itemPath, path.join(dest, item));
    } else if (temp.isDirectory()) {
      copyDirectory(itemPath, path.join(dest, item));
    }
  });

  return true;
}

export function delDirectory(src: string): false | void {
  if (!fs.existsSync(src)) {
    return false;
  }

  const srcstats = fs.statSync(src);
  if (srcstats.isFile()) {
    fs.rmSync(src);
    return;
  }

  const dirs = fs.readdirSync(src);
  dirs.forEach((item) => {
    const itemPath = path.join(src, item);
    const temp = fs.statSync(itemPath);

    if (temp.isFile()) {
      fs.rmSync(itemPath);
    } else if (temp.isDirectory()) {
      delDirectory(itemPath);
    }
  });

  fs.rmdirSync(src);
}

export const delDirEctory = delDirectory;

export async function unzipFile(src: string, dest: string): Promise<void> {
  await compressing.tgz.uncompress(src, dest);
}

export async function zipFile(src: string, dest: string): Promise<void> {
  await compressing.tgz.compressDir(src, dest);
}

export function readYaml(fp: string): unknown {
  const content = fs.readFileSync(fp, "utf-8");
  return yaml.parse(content);
}

export function writeYaml(fp: string, obj: unknown): void {
  fs.writeFileSync(fp, yaml.stringify(obj));
}
