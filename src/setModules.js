
const utils = require("./utils");
const path = require("path");
const fs = require("fs");
const process = require("process");

//过滤modules的工具
async function setModules(rep, compressFlag) {

    if (!rep) {

        console.log("请输入文件路径");
        return;
    }

    if (!fs.existsSync(rep)) {

        rep = path.join(process.cwd(), rep);

        if (!fs.existsSync(rep)) {

            console.log("没有找到这个modules");
            return;
        }
    }

    let list = fs.readdirSync(rep);
    console.log("排除多余的node_modules");
    for (let item of list) {

        let p = path.join(rep, item, "node_modules");
        if (fs.existsSync(p)) {
            utils.delDirEctory(p);
        }
    }

    let zipPath = path.join(rep, "../", "node_modules.zip");
    if (fs.existsSync(zipPath)) {
        fs.rmSync(zipPath);
    }

    console.log("排除完成");

    if (compressFlag) {
        console.log("正在压缩文件");
        //压缩
        await utils.zipFile(rep, zipPath);
        console.log("压缩完成");
    }
}

module.exports = setModules;