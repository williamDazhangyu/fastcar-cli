const process = require("process");
const fs = require("fs");
const path = require("path");
const exec = require("child_process").execSync;
const inquirer = require('inquirer');
const utils = require("./utils");

const WEBTEMPLATEURL = "https://e.coding.net/william_zhong/fast-car/fastcar-boot-web.git"; //web模板
const RPCTEMPLATEURL = "https://e.coding.net/william_zhong/fast-car/fastcar-boot-rpc.git"; //rpc模板
const optionComponent = ["mysql", "redis", "mongo"];

const Questions = async (defaultName) => {
    return new Promise((resolve) => {
        inquirer.prompt([
            {
                type: "input",
                name: 'name',
                default: defaultName,
                message: `name (${defaultName}) :`,
            },
            {
                type: "input",
                name: 'version',
                default: "1.0.0",
                message: "version (1.0.0) :",
            },
            {
                type: "input",
                name: 'description',
                message: "description:",
            },
            {
                type: "input",
                name: 'repositoryUrl',
                message: "repository url:",
            },
            {
                type: "input",
                name: 'author',
                message: "author:",
            },
            {
                type: "input",
                name: 'license',
                default: "MIT",
                message: "license (MIT) :",
            },
            {
                type: "confirm",
                name: 'private',
                message: "private (true) :",
                default: true
            },
            {
                type: "confirm",
                name: 'mysql',
                message: "mysql (true) :",
                default: true
            },
            {
                type: "confirm",
                name: 'redis',
                message: "redis (true) :",
                default: true
            },
            {
                type: "confirm",
                name: 'mongo',
                message: "mongo (false) :",
                default: false
            },
        ]).then(answers => {
            resolve(answers);
        });
    });
}

async function init(args = ["web"]) {

    let currDir = process.cwd();
    let type = args[0];

    let disList = currDir.split(path.sep);
    let lastName = disList[disList.length - 1];

    //判定是否有package.json文件 若存在则跳过这一步
    let realPackagePath = path.join(currDir, "package.json");
    let packageInfo = {};
    let questionInfo = {
        mysql: false,
        redis: false,
        mongo: false,
    };
    let componentList = [];
    if (fs.existsSync(realPackagePath)) {

        packageInfo = require(realPackagePath);
    } else {

        questionInfo = await Questions(lastName);
        packageInfo = {
            name: questionInfo.name,
            version: questionInfo.version,
            description: questionInfo.description,
            author: questionInfo.author,
            license: questionInfo.license,
            private: questionInfo.private,
        };

        if (!!questionInfo.repositoryUrl) {

            let repType = questionInfo.repositoryUrl.split(".");
            Reflect.set(packageInfo, {
                repository: {
                    type: repType,
                    url: questionInfo.repositoryUrl
                }
            });
        }
    }

    Object.keys(packageInfo).forEach((key) => {

        if (!packageInfo[key]) {
            Reflect.deleteProperty(packageInfo, key);
        }
    });

    Object.keys(questionInfo).forEach((key) => {

        if (questionInfo[key]) {
            if (optionComponent.includes(key)) {

                componentList.push(`@fastcar/${key}`);
                if (key == "mysql") {

                    componentList.push(`@fastcar/${key}-tool`);
                }
            }
        }
    });

    //先暂定为只有web组件
    let downloadUrl = "";
    switch (type) {

        case "web": {

            downloadUrl = WEBTEMPLATEURL;
            break;
        }
        case "rpc": {

            downloadUrl = RPCTEMPLATEURL;
            break;
        }
        default: {

            downloadUrl = WEBTEMPLATEURL;
            break;
        }
    }

    if (downloadUrl) {

        let urlList = downloadUrl.split("/");
        let templateName = urlList[urlList.length - 1].replace(/.git/, "");

        console.log(`Start downloading template ${downloadUrl}`);
        exec(`git clone ${downloadUrl} --depth=1`);
        console.log("Download complete");

        //解压依赖
        //删除原先路径下的包
        let templateDir = path.join(currDir, templateName);

        //删除git路径
        let gitPath = path.join(templateDir, ".git");
        if (fs.existsSync(gitPath)) {

            utils.delDirEctory(gitPath);
        }

        console.log("copy template files");
        //复制至项目文件下
        utils.copyDirectory(templateDir, currDir);

        //解压node_modules
        // console.log("unzip node_modules");
        // let nodeModulesPath = path.join(currDir, "node_modules.zip");
        // await utils.unzipFile(nodeModulesPath, currDir);

        //合并package.json文件
        let templatePackagePath = path.join(templateDir, "package.json");
        if (fs.existsSync(templatePackagePath)) {

            let templatePackage = require(templatePackagePath);
            //替换本地包名
            if (templatePackage.scripts) {

                templatePackage.scripts = JSON.stringify(templatePackage.scripts).replace(/\$npm_package_name/g, packageInfo.name);
                templatePackage.scripts = JSON.parse(templatePackage.scripts);
            }
            if (templatePackage.dependencies) {

                if (!packageInfo.dependencies) {

                    packageInfo.dependencies = {};
                }

                let tmpDep = {};
                // Object.keys(templatePackage.dependencies).forEach((tmpKey) => {

                //     let flag = optionComponent.some((o) => {

                //         return tmpKey.indexOf(o) != -1;
                //     });

                //     //如果是可选组件则看有没有被包含进来
                //     if (flag) {

                //         if (!componentList.includes(tmpKey)) {

                //             return;
                //         }
                //     }

                //     Reflect.set(tmpDep, tmpKey, templatePackage.dependencies[tmpKey]);
                // });
                componentList.forEach((item) => {

                    if (!packageInfo.dependencies[item]) {
                        Reflect.set(tmpDep, item, `latest`);
                    }
                });

                packageInfo.dependencies = Object.assign(packageInfo.dependencies, tmpDep, templatePackage.dependencies);
            }

            if (!packageInfo.scripts) {

                packageInfo.scripts = {};
            }

            //覆盖其脚本
            if (templatePackage.scripts) {

                Object.assign(packageInfo.scripts, templatePackage.scripts);
            }

            if (templatePackage.devDependencies) {

                if (!packageInfo.devDependencies) {

                    packageInfo.devDependencies = {};
                }

                Object.assign(packageInfo.devDependencies, templatePackage.devDependencies);
            }
        }

        console.log("wirte packageInfo");
        fs.writeFileSync(realPackagePath, JSON.stringify(packageInfo, null, "\t"));

        //更改配置的文件名
        let projectName = packageInfo.name;

        let pm2RunPath = path.join(currDir, "ecosystem.config.yml");
        if (fs.existsSync(pm2RunPath)) {

            let pm2Config = utils.readYaml(pm2RunPath);
            pm2Config.apps.name = projectName;
            utils.writeYaml(pm2RunPath, pm2Config);
        }

        console.log("clean files");
        utils.delDirEctory(templateDir);
    }
}

module.exports = init;