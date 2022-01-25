#!/usr/bin/env node

const init = require("../src/init");
const setModules = require("../src/setModules");
const packageINFO = require("../package.json");

function run(argv) {

    //命令入口
    if (!argv || argv.length == 0 || argv[0] === '-v' || argv[0] === '--version') {
        console.log(`fastcar-cli version ${packageINFO.version}`);
        return;
    }

    let head = argv[0];
    let body = argv.slice(1);

    switch (head) {

        case "init": {
            init(body);
            break;
        }
        case "clean":
        case "compress": {

            if (!body[0]) {

                body[0] = "node_modules";
            }

            if (body[0] == "node_modules") {

                setModules(body[0], head == "compress");
            } else {

                console.log("Missing file path");
            }
            break;
        }
        default: {
            //命令提示
            console.log('  usage:\n');
            console.log('  -v --version [show version]\n');
            console.log('  init web [init web template]\n');
            console.log('  clean node_modules [Delete redundant modules]\n');
            console.log('  compress node_modules [compress modules]\n');
        }
    }
}

run(process.argv.slice(2));