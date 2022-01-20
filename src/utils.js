const fs = require("fs");
const path = require("path");
const compressing = require("compressing");
const util = require("util");

//复制文件
function copyDirectory(src, dest) {

    if (!fs.existsSync(dest)) {

        fs.mkdirSync(dest);
    }
    if (!fs.existsSync(src)) {

        return false;
    }

    let dirs = fs.readdirSync(src);
    dirs.forEach((item) => {

        let item_path = path.join(src, item);
        let temp = fs.statSync(item_path);

        if (temp.isFile()) {

            fs.copyFileSync(item_path, path.join(dest, item));
        } else if (temp.isDirectory()) {

            copyDirectory(item_path, path.join(dest, item));
        }
    });
}

//递归删除文件夹
function delDirEctory(src) {

    if (!fs.existsSync(src)) {

        return false;
    }

    let dirs = fs.readdirSync(src);
    dirs.forEach((item) => {

        let item_path = path.join(src, item);
        let temp = fs.statSync(item_path);

        if (temp.isFile()) {

            fs.rmSync(item_path);
        } else if (temp.isDirectory()) {

            delDirEctory(item_path);
        }
    });

    fs.rmdirSync(src);
}

async function unzipFile(src, dest) {

    await compressing.zip.uncompress(src, dest);
}

async function zipFile(src, dest) {

    await compressing.zip.compressDir(src, dest);
}

module.exports = {
    copyDirectory,
    delDirEctory,
    unzipFile,
    zipFile,
}