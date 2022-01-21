
const utils = require("./utils");
const path = require("path");
const fs = require("fs");
const process = require("process");

//过滤modules的工具
async function setModules(rep, compressFlag) {

    if (!rep) {

        console.log("Missing file path");
        return;
    }

    if (!fs.existsSync(rep)) {

        rep = path.join(process.cwd(), rep);

        if (!fs.existsSync(rep)) {

            console.log("File path not found", rep);
            return;
        }
    }

    let list = fs.readdirSync(rep);
    console.log("Deleting redundant files");
    for (let item of list) {

        let p = path.join(rep, item, "node_modules");
        if (fs.existsSync(p)) {
            utils.delDirEctory(p);
        }
    }

    console.log("Finish deleting redundant files");

    if (compressFlag) {

        let zipPath = path.join(rep, "../", "node_modules.zip");
        if (fs.existsSync(zipPath)) {
            fs.rmSync(zipPath);
        }

        console.log("Compressing files");
        //压缩
        await utils.zipFile(rep, zipPath);
        console.log("finish Compress files");
    }
}

module.exports = setModules;